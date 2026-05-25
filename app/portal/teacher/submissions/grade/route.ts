import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { gradeSubmissionForTeacher } from "@/lib/repositories/submission-repository";

const MAX_SUBMISSION_FEEDBACK_LENGTH = 2000;

async function writeSubmissionAudit(input: {
  teacherId: string;
  action: string;
  targetId: string;
  before: unknown;
  after: unknown;
  meta?: Record<string, unknown>;
}) {
  await createAdminAuditLog(
    {
      action: input.action,
      adminUserId: input.teacherId,
      after: input.after,
      before: input.before,
      meta: { teacherId: input.teacherId, submissionId: input.targetId, ...input.meta },
      targetId: input.targetId,
      targetType: "submission",
    },
    prisma,
  );
}

function revalidateGradingPaths(submissionId: string) {
  revalidatePath("/portal/teacher");
  revalidatePath("/portal/teacher/submissions");
  revalidatePath(`/portal/teacher/submissions/${submissionId}`);
  revalidatePath("/portal/student");
  revalidatePath("/portal/parent");
}

function safeReturnTo(value: FormDataEntryValue | null, requestUrl: string) {
  const fallback = new URL("/portal/teacher/submissions", requestUrl);
  if (typeof value !== "string") {
    return fallback;
  }
  const candidate = new URL(value, requestUrl);
  if (
    candidate.origin !== fallback.origin ||
    (candidate.pathname !== "/portal/teacher/submissions" &&
      !candidate.pathname.startsWith("/portal/teacher/submissions/"))
  ) {
    return fallback;
  }
  return candidate;
}

function parseGrade(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const grade = Number(value);
  if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
    return null;
  }
  return grade;
}

function parseFeedback(value: FormDataEntryValue | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return { error: false, value: null };
  }
  if (trimmed.length > MAX_SUBMISSION_FEEDBACK_LENGTH) {
    return { error: true, value: null };
  }
  return { error: false, value: trimmed };
}

function feedbackFrom(value: unknown) {
  if (!value || typeof value !== "object" || !("feedback" in value)) {
    return null;
  }
  return (value as { feedback?: string | null }).feedback ?? null;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const submissionId = formData.get("submissionId")?.toString() ?? "";
  const feedback = parseFeedback(formData.get("feedback"));
  const grade = parseGrade(formData.get("grade"));
  const redirectUrl = safeReturnTo(formData.get("returnTo"), request.url);

  try {
    const session = await requireRole([UserRole.TEACHER]);
    if (grade === null) {
      redirectUrl.searchParams.set("error", "grade");
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }
    if (feedback.error) {
      redirectUrl.searchParams.set("error", "feedback");
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }
    const graded = await gradeSubmissionForTeacher(session.uid, submissionId, {
      feedback: feedback.value,
      grade,
    });
    const before = "before" in graded ? graded.before : null;
    const after = "after" in graded ? graded.after : graded;

    await writeSubmissionAudit({
      action: graded.previousGrade === null ? "SUBMISSION_GRADED" : "SUBMISSION_GRADE_UPDATED",
      after,
      before,
      meta: {
        assignmentId: graded.assignmentId ?? null,
        feedbackChanged: feedbackFrom(before) !== feedbackFrom(after),
        grade: graded.grade,
        previousGrade: graded.previousGrade ?? null,
      },
      targetId: graded.id,
      teacherId: session.uid,
    });
    revalidateGradingPaths(graded.id);
    redirectUrl.searchParams.set("graded", "success");
  } catch {
    redirectUrl.searchParams.set("error", "grade");
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
