import { AiDraftStatus, AiDraftType, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  aiDraft: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  appUser: {
    findFirst: vi.fn(),
  },
  enquiry: {
    findUnique: vi.fn(),
  },
  reportSnapshot: {
    findFirst: vi.fn(),
  },
}));

const generateDraftMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ai", () => ({
  createAiProvider: () => ({
    generateDraft: generateDraftMock,
  }),
}));

import {
  createCrmFollowUpDraft,
  createReportCommentDraft,
  listAdminAiDrafts,
  listReportCommentDraftsForTeacher,
  reviewAiDraft,
} from "@/lib/repositories/ai-draft-repository";

describe("ai-draft-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateDraftMock.mockResolvedValue({
      model: "local-deterministic",
      provider: "mock",
      text: "Draft text for human review.",
    });
  });

  it("creates teacher report comment drafts from owned immutable report snapshots only", async () => {
    prismaMock.reportSnapshot.findFirst.mockResolvedValueOnce({
      id: "snapshot-1",
      snapshotData: { grades: { weightedTermAverage: 88 }, student: { fullName: "Amina" } },
      studentId: "student-1",
    });
    prismaMock.aiDraft.create.mockImplementationOnce(async ({ data }) => ({
      id: "draft-1",
      ...data,
    }));

    const result = await createReportCommentDraft("teacher-1", "snapshot-1");

    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { generatedByTeacherId: "teacher-1", id: "snapshot-1" },
    });
    expect(generateDraftMock).toHaveBeenCalledWith({
      input: { grades: { weightedTermAverage: 88 }, student: { fullName: "Amina" } },
      type: AiDraftType.REPORT_COMMENT,
    });
    expect(prismaMock.aiDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: "teacher-1",
        outputText: "Draft text for human review.",
        relatedReportSnapshotId: "snapshot-1",
        relatedStudentId: "student-1",
        status: AiDraftStatus.DRAFT,
        type: AiDraftType.REPORT_COMMENT,
      }),
    });
    expect(result.status).toBe(AiDraftStatus.DRAFT);
  });

  it("rejects report draft generation for foreign or missing snapshots", async () => {
    prismaMock.reportSnapshot.findFirst.mockResolvedValueOnce(null);

    await expect(createReportCommentDraft("teacher-1", "foreign-snapshot")).rejects.toThrow(
      /not found/i,
    );
    expect(generateDraftMock).not.toHaveBeenCalled();
    expect(prismaMock.aiDraft.create).not.toHaveBeenCalled();
  });

  it("creates admin CRM follow-up drafts for active admins without publishing them", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({ id: "admin-1" });
    prismaMock.enquiry.findUnique.mockResolvedValueOnce({
      email: "parent@example.test",
      id: "enquiry-1",
      parentGuardianName: "Parent One",
      preferredSchedule: "Weekends",
      status: "NEW",
      studentName: "Amina",
      subjects: ["Math"],
    });
    prismaMock.aiDraft.create.mockImplementationOnce(async ({ data }) => ({
      id: "draft-1",
      ...data,
    }));

    await createCrmFollowUpDraft("admin-1", "enquiry-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith({
      where: { id: "admin-1", isActive: true, role: UserRole.ADMIN },
      select: { id: true },
    });
    expect(prismaMock.aiDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: "admin-1",
        relatedEnquiryId: "enquiry-1",
        status: AiDraftStatus.DRAFT,
        type: AiDraftType.CRM_FOLLOW_UP,
      }),
    });
  });

  it("lists teacher report drafts only after verifying snapshot ownership", async () => {
    prismaMock.reportSnapshot.findFirst.mockResolvedValueOnce({ id: "snapshot-1" });
    prismaMock.aiDraft.findMany.mockResolvedValueOnce([{ id: "draft-1" }]);

    const result = await listReportCommentDraftsForTeacher("teacher-1", "snapshot-1");

    expect(prismaMock.aiDraft.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      where: {
        createdById: "teacher-1",
        relatedReportSnapshotId: "snapshot-1",
        type: AiDraftType.REPORT_COMMENT,
      },
    });
    expect(result).toEqual([{ id: "draft-1" }]);
  });

  it("returns no admin drafts for non-admin reviewers", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    const result = await listAdminAiDrafts("student-1");

    expect(result).toEqual([]);
    expect(prismaMock.aiDraft.findMany).not.toHaveBeenCalled();
  });

  it("requires role-scoped human review before approving or rejecting drafts", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({ id: "teacher-1", role: UserRole.TEACHER });
    prismaMock.aiDraft.findFirst.mockResolvedValueOnce({
      id: "draft-1",
      status: AiDraftStatus.DRAFT,
    });
    prismaMock.aiDraft.update.mockResolvedValueOnce({
      id: "draft-1",
      status: AiDraftStatus.APPROVED,
    });

    const result = await reviewAiDraft("teacher-1", "draft-1", "APPROVED");

    expect(prismaMock.aiDraft.findFirst).toHaveBeenCalledWith({
      select: { id: true, status: true },
      where: {
        createdById: "teacher-1",
        id: "draft-1",
        type: AiDraftType.REPORT_COMMENT,
      },
    });
    expect(prismaMock.aiDraft.update).toHaveBeenCalledWith({
      data: {
        reviewedAt: expect.any(Date),
        reviewedById: "teacher-1",
        status: "APPROVED",
      },
      where: { id: "draft-1" },
    });
    expect(result.status).toBe(AiDraftStatus.APPROVED);
  });

  it("does not allow already reviewed drafts to be reviewed again", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({ id: "admin-1", role: UserRole.ADMIN });
    prismaMock.aiDraft.findFirst.mockResolvedValueOnce({
      id: "draft-1",
      status: AiDraftStatus.APPROVED,
    });

    await expect(reviewAiDraft("admin-1", "draft-1", "REJECTED")).rejects.toThrow(
      /already been reviewed/i,
    );
    expect(prismaMock.aiDraft.update).not.toHaveBeenCalled();
  });
});
