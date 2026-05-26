import { AiDraftStatus, AiDraftType, type Prisma, UserRole } from "@prisma/client";

import { createAiProvider } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

type AiDraftDatabase = typeof prisma | Prisma.TransactionClient;

function asJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}

export async function createReportCommentDraft(
  teacherId: string,
  snapshotId: string,
  database: AiDraftDatabase = prisma,
) {
  const snapshot = await database.reportSnapshot.findFirst({
    where: { id: snapshotId, generatedByTeacherId: teacherId },
  });
  if (!snapshot) {
    throw new Error("Report snapshot not found.");
  }

  const provider = createAiProvider();
  const inputSnapshot = snapshot.snapshotData as Record<string, unknown>;
  const draft = await provider.generateDraft({
    input: inputSnapshot,
    type: AiDraftType.REPORT_COMMENT,
  });

  return database.aiDraft.create({
    data: {
      createdById: teacherId,
      inputSnapshot: asJson(inputSnapshot),
      model: draft.model,
      outputText: draft.text,
      provider: draft.provider,
      relatedReportSnapshotId: snapshot.id,
      relatedStudentId: snapshot.studentId,
      status: AiDraftStatus.DRAFT,
      type: AiDraftType.REPORT_COMMENT,
    },
  });
}

export async function createCrmFollowUpDraft(
  adminId: string,
  enquiryId: string,
  database: AiDraftDatabase = prisma,
) {
  const admin = await database.appUser.findFirst({
    where: { id: adminId, role: UserRole.ADMIN, isActive: true },
    select: { id: true },
  });
  if (!admin) {
    throw new Error("Admin access is required.");
  }

  const enquiry = await database.enquiry.findUnique({ where: { id: enquiryId } });
  if (!enquiry) {
    throw new Error("Enquiry not found.");
  }

  const inputSnapshot = {
    enquiry: {
      email: enquiry.email,
      parentGuardianName: enquiry.parentGuardianName,
      preferredSchedule: enquiry.preferredSchedule,
      status: enquiry.status,
      studentName: enquiry.studentName,
      subjects: enquiry.subjects,
    },
  };
  const provider = createAiProvider();
  const draft = await provider.generateDraft({
    input: inputSnapshot,
    type: AiDraftType.CRM_FOLLOW_UP,
  });

  return database.aiDraft.create({
    data: {
      createdById: adminId,
      inputSnapshot: asJson(inputSnapshot),
      model: draft.model,
      outputText: draft.text,
      provider: draft.provider,
      relatedEnquiryId: enquiry.id,
      status: AiDraftStatus.DRAFT,
      type: AiDraftType.CRM_FOLLOW_UP,
    },
  });
}

export async function listReportCommentDraftsForTeacher(
  teacherId: string,
  snapshotId: string,
  database: AiDraftDatabase = prisma,
) {
  const snapshot = await database.reportSnapshot.findFirst({
    where: { id: snapshotId, generatedByTeacherId: teacherId },
    select: { id: true },
  });
  if (!snapshot) return [];

  return database.aiDraft.findMany({
    where: {
      createdById: teacherId,
      relatedReportSnapshotId: snapshotId,
      type: AiDraftType.REPORT_COMMENT,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAdminAiDrafts(adminId: string, database: AiDraftDatabase = prisma) {
  const admin = await database.appUser.findFirst({
    where: { id: adminId, role: UserRole.ADMIN, isActive: true },
    select: { id: true },
  });
  if (!admin) return [];

  return database.aiDraft.findMany({
    where: { createdById: adminId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function reviewAiDraft(
  reviewerId: string,
  draftId: string,
  status: "APPROVED" | "REJECTED",
  database: AiDraftDatabase = prisma,
) {
  const reviewer = await database.appUser.findFirst({
    where: { id: reviewerId, isActive: true },
    select: { id: true, role: true },
  });
  if (!reviewer || (reviewer.role !== UserRole.ADMIN && reviewer.role !== UserRole.TEACHER)) {
    throw new Error("AI draft reviewer access is required.");
  }

  const draft = await database.aiDraft.findFirst({
    where:
      reviewer.role === UserRole.ADMIN
        ? { id: draftId, createdBy: { role: UserRole.ADMIN } }
        : { id: draftId, createdById: reviewerId, type: AiDraftType.REPORT_COMMENT },
    select: { id: true, status: true },
  });
  if (!draft) {
    throw new Error("AI draft not found.");
  }
  if (draft.status !== AiDraftStatus.DRAFT) {
    throw new Error("AI draft has already been reviewed.");
  }

  return database.aiDraft.update({
    where: { id: draftId },
    data: {
      reviewedAt: new Date(),
      reviewedById: reviewerId,
      status,
    },
  });
}
