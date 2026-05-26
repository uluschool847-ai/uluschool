"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  buildReportPreview,
  exportReportSnapshotPdf,
  saveReportSnapshot,
} from "@/lib/repositories/report-repository";

const previewSchema = z.object({
  academicTermId: z.string().trim().min(1, "Academic term is required"),
  studentId: z.string().trim().min(1, "Student is required"),
});

const snapshotSchema = z.object({
  academicTermId: z.string().trim().min(1, "Academic term is required"),
  classGroupId: z.string().trim().min(1, "Class/group is required"),
  snapshotData: z.record(z.unknown()),
  studentId: z.string().trim().min(1, "Student is required"),
  teacherComment: z.string().trim().optional().nullable(),
});

type ReportActionResult =
  | { success: true; data: unknown }
  | { success: false; error: string | Record<string, string[] | undefined> };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to process report.";
}

function payloadToObject(payload: unknown) {
  if (payload instanceof FormData) {
    const snapshotDataRaw = payload.get("snapshotData");
    return {
      academicTermId: payload.get("academicTermId"),
      classGroupId: payload.get("classGroupId"),
      snapshotData:
        typeof snapshotDataRaw === "string" && snapshotDataRaw
          ? JSON.parse(snapshotDataRaw)
          : undefined,
      studentId: payload.get("studentId"),
      teacherComment: payload.get("teacherComment"),
    };
  }
  return payload;
}

function revalidateReportPaths(studentId?: string) {
  revalidatePath("/portal/teacher");
  revalidatePath("/portal/teacher/reports");
  if (studentId) {
    revalidatePath(`/portal/teacher/students/${studentId}`);
  }
  revalidatePath("/portal/student");
  revalidatePath("/portal/parent");
}

function revalidateReportSnapshotPaths(snapshotId: string, studentId?: string) {
  revalidateReportPaths(studentId);
  revalidatePath(`/portal/teacher/reports/${snapshotId}`);
  if (studentId) {
    revalidatePath(`/portal/student/reports/${snapshotId}`);
  }
}

export async function buildReportPreviewAction(payload: unknown): Promise<ReportActionResult> {
  const session = await requireRole([UserRole.TEACHER]);
  const parsed = previewSchema.safeParse(payloadToObject(payload));
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors };
  }

  try {
    const preview = await buildReportPreview(
      session.uid,
      parsed.data.studentId,
      parsed.data.academicTermId,
    );
    if (!preview) {
      return { success: false, error: "Report preview is not available." };
    }
    await createAdminAuditLog(
      {
        adminUserId: session.uid,
        actorId: session.uid,
        action: "REPORT_PREVIEW_GENERATED",
        targetType: "reportPreview",
        targetId: parsed.data.studentId,
        meta: {
          teacherId: session.uid,
          studentId: parsed.data.studentId,
          academicTermId: parsed.data.academicTermId,
        },
      } as Parameters<typeof createAdminAuditLog>[0] & { actorId: string },
      prisma,
    );
    return { success: true, data: preview };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function saveReportSnapshotAction(payload: unknown): Promise<ReportActionResult> {
  const session = await requireRole([UserRole.TEACHER]);
  let normalizedPayload: unknown;
  try {
    normalizedPayload = payloadToObject(payload);
  } catch {
    return { success: false, error: "Report snapshot data is invalid." };
  }
  const parsed = snapshotSchema.safeParse(normalizedPayload);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors };
  }

  try {
    const snapshot = await saveReportSnapshot(session.uid, {
      academicTermId: parsed.data.academicTermId,
      classGroupId: parsed.data.classGroupId,
      snapshotData: parsed.data.snapshotData,
      studentId: parsed.data.studentId,
      teacherComment: parsed.data.teacherComment ?? null,
    });
    await createAdminAuditLog(
      {
        adminUserId: session.uid,
        actorId: session.uid,
        action: "REPORT_SNAPSHOT_SAVED",
        targetType: "reportSnapshot",
        targetId: snapshot.id,
        meta: {
          teacherId: session.uid,
          studentId: snapshot.studentId,
          classGroupId: snapshot.classGroupId,
          academicTermId: snapshot.academicTermId,
          reportSnapshotId: snapshot.id,
          snapshotVersion: snapshot.snapshotVersion,
        },
      } as Parameters<typeof createAdminAuditLog>[0] & { actorId: string },
      prisma,
    );
    revalidateReportPaths(snapshot.studentId);
    return { success: true, data: { id: snapshot.id } };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function exportReportSnapshotPdfAction(
  snapshotId: string,
): Promise<ReportActionResult> {
  const session = await requireRole([UserRole.TEACHER]);
  try {
    const exported = await exportReportSnapshotPdf(session.uid, snapshotId);
    await createAdminAuditLog(
      {
        adminUserId: session.uid,
        actorId: session.uid,
        action: "REPORT_PDF_EXPORTED",
        targetType: "reportSnapshot",
        targetId: snapshotId,
        meta: {
          teacherId: session.uid,
          reportSnapshotId: snapshotId,
          storageKey: exported.storageKey,
          pdfStorageKey: exported.snapshot.pdfStorageKey,
          pdfGeneratedAt: exported.snapshot.pdfGeneratedAt,
        },
      } as Parameters<typeof createAdminAuditLog>[0] & { actorId: string },
      prisma,
    );
    revalidateReportSnapshotPaths(snapshotId, exported.snapshot.studentId);
    return { success: true, data: exported };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
