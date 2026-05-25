"use server";

import { AttendanceStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { markLessonAttendanceForTeacher } from "@/lib/repositories/attendance-repository";

const attendanceSchema = z
  .object({
    scheduledClassId: z.string().trim().min(1, "Lesson is required"),
    studentId: z.string().trim().min(1, "Student is required"),
    status: z.enum([AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.ABSENT]),
    lateMinutes: z.coerce.number().int().optional().nullable(),
    reason: z.string().trim().optional().nullable(),
    correction: z.coerce.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.status === AttendanceStatus.LATE && (!value.lateMinutes || value.lateMinutes <= 0)) {
      context.addIssue({
        code: "custom",
        path: ["lateMinutes"],
        message: "Late minutes must be greater than 0",
      });
    }

    if (value.correction && !value.reason?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Reason is required for attendance correction",
      });
    }
  });

type AttendanceActionResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string | Record<string, string[] | undefined> };

function payloadToObject(payload: Record<string, unknown> | FormData) {
  if (payload instanceof FormData) {
    return Object.fromEntries(payload.entries());
  }
  return payload;
}

function revalidateAttendancePaths(scheduledClassId: string) {
  revalidatePath("/portal/teacher");
  revalidatePath("/portal/teacher/schedule");
  revalidatePath(`/portal/teacher/lessons/${scheduledClassId}`);
  revalidatePath("/portal/teacher/attendance");
  revalidatePath("/portal/student");
  revalidatePath("/portal/parent");
}

async function writeAttendanceAudit(input: {
  teacherId: string;
  action: "ATTENDANCE_MARKED" | "ATTENDANCE_UPDATED";
  attendance: {
    id?: string;
    scheduledClassId: string;
    studentId: string;
    status: string;
    lateMinutes?: number | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
  };
}) {
  const attendanceId = input.attendance.id ?? null;
  await createAdminAuditLog(
    {
      adminUserId: input.teacherId,
      action: input.action,
      targetType: "attendance",
      targetId: attendanceId,
      before: input.attendance.before ?? null,
      after: input.attendance.after ?? input.attendance,
      meta: {
        teacherId: input.teacherId,
        studentId: input.attendance.studentId,
        scheduledClassId: input.attendance.scheduledClassId,
        attendanceId,
        status: input.attendance.status,
        lateMinutes: input.attendance.lateMinutes ?? null,
        reason: input.attendance.reason ?? null,
      },
    },
    prisma,
  );
}

function flattenError(error: z.ZodError) {
  return error.flatten().fieldErrors;
}

export async function markAttendanceAction(
  payload: Record<string, unknown> | FormData,
): Promise<AttendanceActionResult> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = attendanceSchema.safeParse(payloadToObject(payload));
    if (!parsed.success) {
      return { success: false, error: flattenError(parsed.error) };
    }

    const attendance = await markLessonAttendanceForTeacher(session.uid, {
      scheduledClassId: parsed.data.scheduledClassId,
      studentId: parsed.data.studentId,
      status: parsed.data.status,
      lateMinutes: parsed.data.lateMinutes ?? null,
      reason: parsed.data.reason ?? null,
    });

    await writeAttendanceAudit({
      teacherId: session.uid,
      action: attendance.before ? "ATTENDANCE_UPDATED" : "ATTENDANCE_MARKED",
      attendance,
    });
    revalidateAttendancePaths(attendance.scheduledClassId);

    return { success: true, data: { id: attendance.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to mark attendance",
    };
  }
}

export async function updateAttendanceAction(
  attendanceId: string,
  payload: Record<string, unknown> | FormData,
): Promise<AttendanceActionResult> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = attendanceSchema.safeParse(payloadToObject(payload));
    if (!parsed.success) {
      return { success: false, error: flattenError(parsed.error) };
    }

    const attendance = await markLessonAttendanceForTeacher(session.uid, {
      attendanceId,
      scheduledClassId: parsed.data.scheduledClassId,
      studentId: parsed.data.studentId,
      status: parsed.data.status,
      lateMinutes: parsed.data.lateMinutes ?? null,
      reason: parsed.data.reason ?? null,
    });

    await writeAttendanceAudit({
      teacherId: session.uid,
      action: "ATTENDANCE_UPDATED",
      attendance,
    });
    revalidateAttendancePaths(attendance.scheduledClassId);

    return { success: true, data: { id: attendance.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update attendance",
    };
  }
}
