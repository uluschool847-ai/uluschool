"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createTeacherUnavailablePeriod,
  deleteTeacherUnavailablePeriod,
  updateTeacherUnavailablePeriod,
} from "@/lib/repositories/teacher-availability-repository";
import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  localDateTimeToUtc,
  normalizeAvailabilityTimezone,
} from "@/lib/scheduling/availability";

type ActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const dateTimeValueSchema = z.string().trim().min(1, "Date and time are required.");

const periodBaseSchema = z.object({
  id: z.string().trim().optional(),
  teacherId: z.string().trim().optional(),
  startAt: dateTimeValueSchema,
  endAt: dateTimeValueSchema,
  timezone: z
    .string()
    .trim()
    .transform((value) => normalizeAvailabilityTimezone(value || DEFAULT_AVAILABILITY_TIMEZONE)),
  reason: z
    .string()
    .trim()
    .transform((value) => value || undefined),
});

function parsePeriodDateRange(
  value: { startAt: string; endAt: string; timezone: string },
  ctx: z.RefinementCtx,
) {
  let startAt: Date | null = null;
  let endAt: Date | null = null;
  try {
    startAt = localDateTimeToUtc({ value: value.startAt, timezone: value.timezone });
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startAt"],
      message: "Date and time must be valid.",
    });
  }
  try {
    endAt = localDateTimeToUtc({ value: value.endAt, timezone: value.timezone });
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endAt"],
      message: "Date and time must be valid.",
    });
  }
  if (startAt && endAt && startAt >= endAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endAt"],
      message: "End time must be after start time.",
    });
  }
}

function toPeriodDates<T extends { startAt: string; endAt: string; timezone: string }>(value: T) {
  return {
    ...value,
    endAt: localDateTimeToUtc({ value: value.endAt, timezone: value.timezone }),
    startAt: localDateTimeToUtc({ value: value.startAt, timezone: value.timezone }),
  };
}

const periodSchema = periodBaseSchema.superRefine(parsePeriodDateRange).transform(toPeriodDates);

const periodUpdateSchema = periodBaseSchema
  .extend({ id: z.string().trim().min(1, "Period id is required.") })
  .superRefine(parsePeriodDateRange)
  .transform(toPeriodDates);

const idSchema = z.object({
  id: z.string().trim().min(1, "Period id is required."),
  teacherId: z.string().trim().optional(),
});

function normalizePeriodForm(formData: FormData) {
  return {
    id: formData.get("id")?.toString() ?? "",
    teacherId: formData.get("teacherId")?.toString() ?? "",
    startAt: formData.get("startAt")?.toString() ?? "",
    endAt: formData.get("endAt")?.toString() ?? "",
    timezone: formData.get("timezone")?.toString() ?? DEFAULT_AVAILABILITY_TIMEZONE,
    reason: formData.get("reason")?.toString() ?? "",
  };
}

function failureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function revalidateTeacherPortalAvailability() {
  revalidatePath("/portal/teacher/availability");
  revalidatePath("/portal/teacher");
  revalidatePath("/portal/teacher/schedule");
}

function unwrapMutationResult<T>(result: T | { before: T; after: T }) {
  if (result && typeof result === "object" && "before" in result && "after" in result) {
    return result as { before: T; after: T };
  }
  return { before: null, after: result as T };
}

async function writeUnavailablePeriodAudit(
  input: {
    teacherId: string;
    action: string;
    targetId: string | null;
    before: unknown;
    after: unknown;
    meta?: Record<string, unknown>;
  },
  tx: Parameters<typeof createAdminAuditLog>[1],
) {
  await createAdminAuditLog(
    {
      adminUserId: input.teacherId,
      action: input.action,
      targetType: "teacher_availability",
      targetId: input.targetId,
      before: input.before,
      after: input.after,
      meta: { teacherId: input.teacherId, ...input.meta },
    },
    tx,
  );
}

export async function createTeacherUnavailablePeriodAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole([UserRole.TEACHER]);
  const parsed = periodSchema.safeParse(normalizePeriodForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    const period = await prisma.$transaction(async (tx) => {
      const created = await createTeacherUnavailablePeriod(
        { ...parsed.data, teacherId: session.uid },
        tx,
      );
      await writeUnavailablePeriodAudit(
        {
          teacherId: session.uid,
          action: "TEACHER_UNAVAILABLE_PERIOD_CREATED",
          targetId: created.id,
          before: null,
          after: created,
          meta: {
            endAt: parsed.data.endAt,
            startAt: parsed.data.startAt,
            timezone: parsed.data.timezone,
          },
        },
        tx,
      );
      return created;
    });
    revalidateTeacherPortalAvailability();
    return { success: true, message: `Unavailable period created: ${period.id}` };
  } catch (error) {
    return {
      success: false,
      message: failureMessage(error, "Failed to create unavailable period."),
    };
  }
}

export async function updateTeacherUnavailablePeriodAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole([UserRole.TEACHER]);
  const parsed = periodUpdateSchema.safeParse(normalizePeriodForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await prisma.$transaction(async (tx) => {
      const result = unwrapMutationResult(
        await updateTeacherUnavailablePeriod(parsed.data.id, session.uid, parsed.data, tx),
      );
      await writeUnavailablePeriodAudit(
        {
          teacherId: session.uid,
          action: "TEACHER_UNAVAILABLE_PERIOD_UPDATED",
          targetId: parsed.data.id,
          before: result.before,
          after: result.after,
          meta: {
            endAt: parsed.data.endAt,
            startAt: parsed.data.startAt,
            timezone: parsed.data.timezone,
          },
        },
        tx,
      );
    });
    revalidateTeacherPortalAvailability();
    return { success: true, message: "Unavailable period updated." };
  } catch (error) {
    return {
      success: false,
      message: failureMessage(error, "Failed to update unavailable period."),
    };
  }
}

export async function deleteTeacherUnavailablePeriodAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole([UserRole.TEACHER]);
  const parsed = idSchema.safeParse(normalizePeriodForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await prisma.$transaction(async (tx) => {
      const deleted = await deleteTeacherUnavailablePeriod(parsed.data.id, session.uid, tx);
      await writeUnavailablePeriodAudit(
        {
          teacherId: session.uid,
          action: "TEACHER_UNAVAILABLE_PERIOD_DELETED",
          targetId: deleted.id,
          before: deleted,
          after: { deleted: true },
          meta: {
            timezone: DEFAULT_AVAILABILITY_TIMEZONE,
          },
        },
        tx,
      );
    });
    revalidateTeacherPortalAvailability();
    return { success: true, message: "Unavailable period deleted." };
  } catch (error) {
    return {
      success: false,
      message: failureMessage(error, "Failed to delete unavailable period."),
    };
  }
}
