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
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  aiDraft: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/repositories/ai-draft-repository", () => ({
  createCrmFollowUpDraft: createCrmFollowUpDraftMock,
  createReportCommentDraft: createReportCommentDraftMock,
  reviewAiDraft: reviewAiDraftMock,
}));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
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
    createCrmFollowUpDraftMock.mockResolvedValue({
      createdById: "admin-1",
      id: "draft-2",
      relatedEnquiryId: "enquiry-1",
      status: AiDraftStatus.DRAFT,
      type: "CRM_FOLLOW_UP",
    });
    prismaMock.aiDraft.findUnique.mockResolvedValue({
      createdById: "admin-1",
      id: "draft-2",
      relatedEnquiryId: "enquiry-1",
      status: AiDraftStatus.DRAFT,
      type: "CRM_FOLLOW_UP",
    });
    reviewAiDraftMock.mockResolvedValue({
      createdById: "admin-1",
      id: "draft-2",
      reviewedById: "admin-1",
      status: AiDraftStatus.APPROVED,
      type: "CRM_FOLLOW_UP",
    });
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
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AI_DRAFT_CREATED",
        adminUserId: "admin-1",
        targetId: "draft-2",
        targetType: "ai_draft",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/ai-drafts");
    expect(result).toEqual({
      data: expect.objectContaining({ id: "draft-2", status: AiDraftStatus.DRAFT }),
      success: true,
    });
  });

  it("lets admins approve or reject CRM drafts with audit coverage", async () => {
    mockSession = { uid: "admin-1", role: UserRole.ADMIN };
    const actions = await loadAdminActions();

    const result = await actions.reviewAdminAiDraftAction({
      draftId: "draft-2",
      status: AiDraftStatus.APPROVED,
    });

    expect(prismaMock.aiDraft.findUnique).toHaveBeenCalledWith({
      select: expect.objectContaining({
        id: true,
        status: true,
        type: true,
      }),
      where: { id: "draft-2" },
    });
    expect(reviewAiDraftMock).toHaveBeenCalledWith("admin-1", "draft-2", AiDraftStatus.APPROVED);
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AI_DRAFT_REVIEWED",
        adminUserId: "admin-1",
        targetId: "draft-2",
        targetType: "ai_draft",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/ai-drafts");
    expect(result).toEqual({
      data: expect.objectContaining({ id: "draft-2", status: AiDraftStatus.APPROVED }),
      success: true,
    });
  });

  it("does not write admin AI draft audit logs when generation fails", async () => {
    mockSession = { uid: "admin-1", role: UserRole.ADMIN };
    createCrmFollowUpDraftMock.mockRejectedValueOnce(new Error("Enquiry not found."));
    const actions = await loadAdminActions();

    const result = await actions.generateCrmFollowUpDraftAction({ enquiryId: "missing" });

    expect(result).toEqual(
      expect.objectContaining({
        error: "Enquiry not found.",
        success: false,
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
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
