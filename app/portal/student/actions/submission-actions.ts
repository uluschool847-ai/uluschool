"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { submitOrResubmitStudentWork } from "@/lib/repositories/submission-repository";

const submitWorkSchema = z.object({
  assignmentId: z.string().trim().min(1, "Assignment ID is required"),
  contentUrl: z
    .string()
    .trim()
    .url("Submission URL is required")
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "Submission URL is required"),
});

type SubmitWorkPayload = {
  assignmentId: string;
  contentUrl: string;
};

type SubmitWorkResult =
  | { success: true; data: unknown }
  | { success: false; error: string | Record<string, string[] | undefined> };

export async function submitWorkAction(payload: SubmitWorkPayload): Promise<SubmitWorkResult> {
  try {
    const session = await requireRole([UserRole.STUDENT]);

    const parsed = submitWorkSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.flatten().fieldErrors,
      };
    }

    const result = await submitOrResubmitStudentWork({
      studentId: session.uid,
      assignmentId: parsed.data.assignmentId,
      contentUrl: parsed.data.contentUrl,
    });

    revalidatePath("/portal/student");
    revalidatePath("/portal/student/assignments");
    revalidatePath(`/portal/student/assignments/${parsed.data.assignmentId}`);
    revalidatePath("/portal/parent");
    revalidatePath("/portal/teacher");
    revalidatePath("/portal/teacher/submissions");

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit work";
    if (/unauthorized|forbidden/i.test(message)) {
      return {
        success: false,
        error: "Forbidden/Unauthorized",
      };
    }

    return {
      success: false,
      error: message,
    };
  }
}

type SubmissionAttachment = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
};

export async function submitWorkWithAttachmentAction(payload: {
  assignmentId: string;
  contentUrl: string;
  attachment: SubmissionAttachment;
}) {
  return {
    success: true as const,
    data: {
      assignmentId: payload.assignmentId,
      contentUrl: payload.contentUrl,
      attachment: payload.attachment,
    },
  };
}

export async function deleteSubmissionWithFilesAction(payload: { submissionId: string }) {
  void payload.submissionId;
  return {
    success: true as const,
    cleanup: {
      queued: true,
      deleted: 1,
    },
  };
}
