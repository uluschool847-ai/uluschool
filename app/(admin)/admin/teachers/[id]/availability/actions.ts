"use server";

import { AvailabilitySlotStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createTeacherAvailabilityRule,
  createTeacherUnavailablePeriod,
  deleteTeacherAvailabilityRule,
  deleteTeacherUnavailablePeriod,
  setTeacherAvailabilityRuleStatus,
  updateTeacherAvailabilityRule,
  updateTeacherUnavailablePeriod,
} from "@/lib/repositories/teacher-availability-repository";
import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  isValidTimezone,
  localDateTimeToUtc,
  normalizeAvailabilityTimezone,
} from "@/lib/scheduling/availability";

type ActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const TRANSACTION_OPTIONS = { timeout: 20_000 };

const timeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/, "Time must use HH:mm format.");

const timezoneSchema = z
  .string()
  .trim()
  .transform((value) => value || DEFAULT_AVAILABILITY_TIMEZONE)
  .superRefine((value, ctx) => {
    if (!isValidTimezone(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Timezone must be valid." });
    }
  });

const dateTimeValueSchema = z.string().trim().min(1, "Date and time are required.");

const ruleBaseSchema = z.object({
  id: z.string().trim().optional(),
  teacherId: z.string().trim().min(1, "Teacher is required."),
  weekday: z.coerce.number().int().min(1, "Weekday must be 1-7.").max(7, "Weekday must be 1-7."),
  startTime: timeSchema,
  endTime: timeSchema,
  timezone: timezoneSchema,
  status: z.nativeEnum(AvailabilitySlotStatus).default(AvailabilitySlotStatus.ACTIVE),
});

const ruleSchema = ruleBaseSchema.superRefine((value, ctx) => {
  if (value.startTime >= value.endTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "End time must be after start time.",
    });
  }
});

const ruleUpdateSchema = ruleBaseSchema
  .extend({
    id: z.string().trim().min(1, "Rule id is required."),
  })
  .superRefine((value, ctx) => {
    if (value.startTime >= value.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "End time must be after start time.",
      });
    }
  });

const periodBaseSchema = z.object({
  id: z.string().trim().optional(),
  teacherId: z.string().trim().min(1, "Teacher is required."),
  startAt: dateTimeValueSchema,
  endAt: dateTimeValueSchema,
  timezone: timezoneSchema,
  reason: z
    .string()
    .trim()
    .transform((value) => value || null),
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
  const timezone = normalizeAvailabilityTimezone(value.timezone);
  return {
    ...value,
    endAt: localDateTimeToUtc({ value: value.endAt, timezone }),
    startAt: localDateTimeToUtc({ value: value.startAt, timezone }),
    timezone,
  };
}

const periodSchema = periodBaseSchema.superRefine(parsePeriodDateRange).transform(toPeriodDates);

const periodUpdateSchema = periodBaseSchema
  .extend({
    id: z.string().trim().min(1, "Period id is required."),
  })
  .superRefine(parsePeriodDateRange)
  .transform(toPeriodDates);

const idSchema = z.object({
  id: z.string().trim().min(1, "Id is required."),
  teacherId: z.string().trim().min(1, "Teacher is required."),
});

function normalizeRuleForm(formData: FormData) {
  return {
    id: formData.get("id")?.toString() ?? "",
    teacherId: formData.get("teacherId")?.toString() ?? "",
    weekday: formData.get("weekday")?.toString() ?? "",
    startTime: formData.get("startTime")?.toString() ?? "",
    endTime: formData.get("endTime")?.toString() ?? "",
    timezone: formData.get("timezone")?.toString() ?? "Europe/Kiev",
    status: formData.get("status")?.toString() || "ACTIVE",
  };
}

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

function isNextRedirect(error: unknown) {
  if (!(error instanceof Error)) return false;
  const digest = "digest" in error ? String(error.digest) : "";
  return error.message === "NEXT_REDIRECT" || digest.startsWith("NEXT_REDIRECT");
}

async function requireAdmin(fallback: string): Promise<
  | { success: true; uid: string }
  | {
      success: false;
      result: ActionResult;
    }
> {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    return { success: true, uid: session.uid };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return { success: false, result: { success: false, message: failureMessage(error, fallback) } };
  }
}

async function assertTeacherTarget(teacherId: string) {
  const teacher = await prisma.appUser.findUnique({
    where: { id: teacherId },
    select: { id: true, role: true },
  });
  if (!teacher || teacher.role !== UserRole.TEACHER) {
    throw new Error("Target account must be a teacher.");
  }
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch (error) {
    if (error instanceof Error && /static generation store missing/i.test(error.message)) return;
    throw error;
  }
}

function revalidateAvailabilityPaths(teacherId: string) {
  safeRevalidate(`/admin/teachers/${teacherId}/availability`);
  safeRevalidate("/admin/teachers");
  safeRevalidate("/portal/teacher/availability");
  safeRevalidate("/portal/teacher/schedule");
}

function redirectTarget(
  formData: FormData,
  field: "successRedirect" | "errorRedirect",
  fallback: string,
) {
  const target = formData.get(field)?.toString();
  return target?.startsWith("/") ? target : fallback;
}

function redirectWithMessage(target: string, key: string, message: string): never {
  const separator = target.includes("?") ? "&" : "?";
  redirect(`${target}${separator}${key}=${encodeURIComponent(message)}`);
}

function maybeRedirect(formData: FormData, key: string, message: string, fallback: string): void {
  if (formData.get("flash")?.toString() === "true") {
    redirectWithMessage(
      redirectTarget(
        formData,
        key === "availabilityMessage" ? "successRedirect" : "errorRedirect",
        fallback,
      ),
      key,
      message,
    );
  }
}

function unwrapMutationResult<T>(result: T | { before: T; after: T }) {
  if (result && typeof result === "object" && "before" in result && "after" in result) {
    return result as { before: T; after: T };
  }
  return { before: null, after: result as T };
}

async function writeAvailabilityAudit(
  input: {
    adminUserId: string;
    action: string;
    targetType: string;
    targetId: string | null;
    teacherId: string;
    before: unknown;
    after: unknown;
    meta?: Record<string, unknown>;
  },
  tx: Parameters<typeof createAdminAuditLog>[1],
) {
  await createAdminAuditLog(
    {
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before,
      after: input.after,
      meta: { teacherId: input.teacherId, ...input.meta },
    },
    tx,
  );
}

export async function createTeacherAvailabilityRuleAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin("Failed to create availability rule.");
  if (!session.success) return session.result;

  const parsed = ruleSchema.safeParse(normalizeRuleForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await assertTeacherTarget(parsed.data.teacherId);
    const rule = await prisma.$transaction(async (tx) => {
      const created = await createTeacherAvailabilityRule(parsed.data, tx);
      await writeAvailabilityAudit(
        {
          adminUserId: session.uid,
          action: "TEACHER_AVAILABILITY_RULE_CREATED",
          targetType: "teacher_availability",
          targetId: created.id,
          teacherId: parsed.data.teacherId,
          before: null,
          after: created,
          meta: {
            endTime: parsed.data.endTime,
            startTime: parsed.data.startTime,
            timezone: parsed.data.timezone,
            weekday: parsed.data.weekday,
          },
        },
        tx,
      );
      return created;
    }, TRANSACTION_OPTIONS);
    revalidateAvailabilityPaths(parsed.data.teacherId);
    maybeRedirect(
      formData,
      "availabilityMessage",
      "Availability rule created.",
      `/admin/teachers/${rule.teacherId}/availability`,
    );
    return { success: true, message: "Availability rule created." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = failureMessage(error, "Failed to create availability rule.");
    maybeRedirect(
      formData,
      "availabilityError",
      message,
      `/admin/teachers/${parsed.data.teacherId}/availability`,
    );
    return { success: false, message };
  }
}

export async function updateTeacherAvailabilityRuleAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin("Failed to update availability rule.");
  if (!session.success) return session.result;

  const parsed = ruleUpdateSchema.safeParse(normalizeRuleForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await assertTeacherTarget(parsed.data.teacherId);
    await prisma.$transaction(async (tx) => {
      const result = unwrapMutationResult(
        await updateTeacherAvailabilityRule(parsed.data.id, parsed.data.teacherId, parsed.data, tx),
      );
      await writeAvailabilityAudit(
        {
          adminUserId: session.uid,
          action: "TEACHER_AVAILABILITY_RULE_UPDATED",
          targetType: "teacher_availability",
          targetId: parsed.data.id,
          teacherId: parsed.data.teacherId,
          before: result.before,
          after: result.after,
          meta: {
            endTime: parsed.data.endTime,
            startTime: parsed.data.startTime,
            timezone: parsed.data.timezone,
            weekday: parsed.data.weekday,
          },
        },
        tx,
      );
    }, TRANSACTION_OPTIONS);
    revalidateAvailabilityPaths(parsed.data.teacherId);
    return { success: true, message: "Availability rule updated." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return {
      success: false,
      message: failureMessage(error, "Failed to update availability rule."),
    };
  }
}

export async function toggleTeacherAvailabilityRuleStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin("Failed to update availability rule status.");
  if (!session.success) return session.result;

  const parsed = idSchema
    .extend({ status: z.nativeEnum(AvailabilitySlotStatus) })
    .safeParse(normalizeRuleForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await assertTeacherTarget(parsed.data.teacherId);
    await prisma.$transaction(async (tx) => {
      const result = unwrapMutationResult(
        await setTeacherAvailabilityRuleStatus(
          parsed.data.id,
          parsed.data.teacherId,
          parsed.data.status,
          tx,
        ),
      );
      await writeAvailabilityAudit(
        {
          adminUserId: session.uid,
          action: "TEACHER_AVAILABILITY_RULE_STATUS_UPDATED",
          targetType: "teacher_availability",
          targetId: parsed.data.id,
          teacherId: parsed.data.teacherId,
          before: result.before,
          after: result.after,
          meta: {
            timezone: normalizeAvailabilityTimezone(normalizeRuleForm(formData).timezone),
            weekday: Number(normalizeRuleForm(formData).weekday || 0),
          },
        },
        tx,
      );
    }, TRANSACTION_OPTIONS);
    revalidateAvailabilityPaths(parsed.data.teacherId);
    return { success: true, message: "Availability rule status updated." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return {
      success: false,
      message: failureMessage(error, "Failed to update availability rule status."),
    };
  }
}

export async function deleteTeacherAvailabilityRuleAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin("Failed to delete availability rule.");
  if (!session.success) return session.result;

  const parsed = idSchema.safeParse(normalizeRuleForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await assertTeacherTarget(parsed.data.teacherId);
    const removed = await prisma.$transaction(async (tx) => {
      const deleted = await deleteTeacherAvailabilityRule(
        parsed.data.id,
        parsed.data.teacherId,
        tx,
      );
      await writeAvailabilityAudit(
        {
          adminUserId: session.uid,
          action: "TEACHER_AVAILABILITY_RULE_DELETED",
          targetType: "teacher_availability",
          targetId: deleted.id,
          teacherId: parsed.data.teacherId,
          before: deleted,
          after: { deleted: true },
          meta: {
            endTime: normalizeRuleForm(formData).endTime,
            startTime: normalizeRuleForm(formData).startTime,
            timezone: normalizeAvailabilityTimezone(normalizeRuleForm(formData).timezone),
            weekday: Number(normalizeRuleForm(formData).weekday || 0),
          },
        },
        tx,
      );
      return deleted;
    }, TRANSACTION_OPTIONS);
    revalidateAvailabilityPaths(parsed.data.teacherId);
    return { success: true, message: `Availability rule deleted: ${removed.id}` };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return {
      success: false,
      message: failureMessage(error, "Failed to delete availability rule."),
    };
  }
}

export async function createTeacherUnavailablePeriodAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin("Failed to create unavailable period.");
  if (!session.success) return session.result;

  const parsed = periodSchema.safeParse(normalizePeriodForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await assertTeacherTarget(parsed.data.teacherId);
    const period = await prisma.$transaction(async (tx) => {
      const created = await createTeacherUnavailablePeriod(parsed.data, tx);
      await writeAvailabilityAudit(
        {
          adminUserId: session.uid,
          action: "TEACHER_UNAVAILABLE_PERIOD_CREATED",
          targetType: "teacher_availability",
          targetId: created.id,
          teacherId: parsed.data.teacherId,
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
    }, TRANSACTION_OPTIONS);
    revalidateAvailabilityPaths(parsed.data.teacherId);
    maybeRedirect(
      formData,
      "availabilityMessage",
      "Unavailable period created.",
      `/admin/teachers/${period.teacherId}/availability`,
    );
    return { success: true, message: "Unavailable period created." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = failureMessage(error, "Failed to create unavailable period.");
    maybeRedirect(
      formData,
      "availabilityError",
      message,
      `/admin/teachers/${parsed.data.teacherId}/availability`,
    );
    return { success: false, message };
  }
}

export async function updateTeacherUnavailablePeriodAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin("Failed to update unavailable period.");
  if (!session.success) return session.result;

  const parsed = periodUpdateSchema.safeParse(normalizePeriodForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await assertTeacherTarget(parsed.data.teacherId);
    await prisma.$transaction(async (tx) => {
      const result = unwrapMutationResult(
        await updateTeacherUnavailablePeriod(
          parsed.data.id,
          parsed.data.teacherId,
          parsed.data,
          tx,
        ),
      );
      await writeAvailabilityAudit(
        {
          adminUserId: session.uid,
          action: "TEACHER_UNAVAILABLE_PERIOD_UPDATED",
          targetType: "teacher_availability",
          targetId: parsed.data.id,
          teacherId: parsed.data.teacherId,
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
    }, TRANSACTION_OPTIONS);
    revalidateAvailabilityPaths(parsed.data.teacherId);
    return { success: true, message: "Unavailable period updated." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return {
      success: false,
      message: failureMessage(error, "Failed to update unavailable period."),
    };
  }
}

export async function deleteTeacherUnavailablePeriodAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin("Failed to delete unavailable period.");
  if (!session.success) return session.result;

  const parsed = idSchema.safeParse(normalizePeriodForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await assertTeacherTarget(parsed.data.teacherId);
    await prisma.$transaction(async (tx) => {
      const deleted = await deleteTeacherUnavailablePeriod(
        parsed.data.id,
        parsed.data.teacherId,
        tx,
      );
      await writeAvailabilityAudit(
        {
          adminUserId: session.uid,
          action: "TEACHER_UNAVAILABLE_PERIOD_DELETED",
          targetType: "teacher_availability",
          targetId: deleted.id,
          teacherId: parsed.data.teacherId,
          before: deleted,
          after: { deleted: true },
          meta: {
            timezone: normalizeAvailabilityTimezone(normalizePeriodForm(formData).timezone),
          },
        },
        tx,
      );
    }, TRANSACTION_OPTIONS);
    revalidateAvailabilityPaths(parsed.data.teacherId);
    return { success: true, message: "Unavailable period deleted." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return {
      success: false,
      message: failureMessage(error, "Failed to delete unavailable period."),
    };
  }
}
