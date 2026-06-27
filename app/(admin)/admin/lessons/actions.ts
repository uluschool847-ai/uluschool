"use server";

import { LessonStatus, MeetingProvider, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  createGoogleMeetEventForLesson,
  deleteGoogleMeetEventForLesson,
  isGoogleCalendarEnabled,
  updateGoogleMeetEventForLesson,
} from "@/lib/integrations/google-calendar";
import { normalizeLiveLessonUrl, validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  cancelLesson,
  completeLesson,
  createLesson,
  createRecurringLessons,
  deleteLesson,
  getLessonById,
  rescheduleLesson,
  updateLesson,
  updateLessonMeetingLink,
} from "@/lib/repositories/lesson-repository";
import { checkTeacherAvailability } from "@/lib/repositories/teacher-availability-repository";

export type LessonActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const LESSON_TRANSACTION_OPTIONS = { timeout: 20_000 };

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalId = z
  .string()
  .trim()
  .transform((value) => value || null);

const dateTimeSchema = z
  .string()
  .trim()
  .min(1, "Date and time are required.")
  .transform((value, ctx) => {
    const normalized = /z$|[+-]\d{2}:\d{2}$/i.test(value) ? value : `${value}:00.000Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date and time must be valid." });
      return z.NEVER;
    }
    return date;
  });

const dateSchema = z
  .string()
  .trim()
  .min(1, "Date is required.")
  .transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date must be valid." });
      return z.NEVER;
    }
    return date;
  });

const reminderSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const minutes = Number(value || "60");
    if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Reminder must be numeric." });
      return z.NEVER;
    }
    return minutes;
  });

const meetingProviderSchema = z
  .string()
  .trim()
  .transform((value) => value || MeetingProvider.GOOGLE_MEET)
  .pipe(z.enum([MeetingProvider.GOOGLE_MEET, MeetingProvider.MANUAL_URL]));

function addMeetingUrlIssue(
  ctx: z.RefinementCtx,
  liveLessonUrl: string | null | undefined,
  meetingProvider: MeetingProvider,
  options: { required?: boolean } = {},
) {
  const validation = validateLiveLessonUrl(liveLessonUrl, meetingProvider, options);
  if (!validation.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["liveLessonUrl"],
      message: validation.reason,
    });
  }
}

function normalizeRequiredMeetingUrl<
  T extends { liveLessonUrl: string; meetingProvider: MeetingProvider },
>(data: T): T {
  return {
    ...data,
    liveLessonUrl: normalizeLiveLessonUrl(data.liveLessonUrl) ?? "",
  };
}

const lessonBaseSchema = z.object({
  id: z.string().trim().optional(),
  classGroupId: z.string().trim().min(1, "Class group is required."),
  title: z.string().trim().min(1, "Title is required."),
  description: optionalText,
  startAt: dateTimeSchema,
  endAt: dateTimeSchema,
  timezone: z.string().trim().default("Africa/Nairobi"),
  teacherId: optionalId,
  subjectId: optionalId,
  liveLessonUrl: z.string().trim(),
  meetingProvider: meetingProviderSchema,
  reminderMinutesBefore: reminderSchema,
});

const lessonSchema = lessonBaseSchema.superRefine((value, ctx) => {
  if (value.startAt >= value.endAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endAt"],
      message: "End time must be after start time.",
    });
  }
  addMeetingUrlIssue(ctx, value.liveLessonUrl, value.meetingProvider, {
    required: !(value.meetingProvider === MeetingProvider.GOOGLE_MEET && !value.liveLessonUrl),
  });
});

const lessonUpdateSchema = lessonBaseSchema
  .extend({
    id: z.string().trim().min(1, "Lesson id is required."),
  })
  .superRefine((value, ctx) => {
    if (value.startAt >= value.endAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "End time must be after start time.",
      });
    }
    addMeetingUrlIssue(ctx, value.liveLessonUrl, value.meetingProvider);
  });

const cancelSchema = z.object({
  id: z.string().trim().min(1, "Lesson id is required."),
  classGroupId: z.string().trim().min(1, "Class group is required."),
  cancelReason: z.string().trim().min(1, "Cancel reason is required."),
});

const idSchema = z.object({
  id: z.string().trim().min(1, "Lesson id is required."),
  classGroupId: z.string().trim().min(1, "Class group is required."),
});

const meetingLinkSchema = z
  .object({
    lessonId: z.string().trim().min(1, "Lesson id is required."),
    classGroupId: optionalId,
    meetingProvider: meetingProviderSchema,
    liveLessonUrl: z.string().trim(),
  })
  .superRefine((value, ctx) => {
    addMeetingUrlIssue(ctx, value.liveLessonUrl, value.meetingProvider, { required: false });
  });

const recurringSchema = z
  .object({
    classGroupId: z.string().trim().min(1, "Class group is required."),
    title: z.string().trim().min(1, "Title is required."),
    description: optionalText,
    startDate: dateSchema,
    endDate: dateSchema,
    weekdays: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, "At least one weekday is required."),
    startTime: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/, "Start time is required."),
    endTime: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/, "End time is required."),
    timezone: z.string().trim().default("Africa/Nairobi"),
    teacherId: optionalId,
    subjectId: optionalId,
    liveLessonUrl: z.string().trim(),
    meetingProvider: meetingProviderSchema,
  })
  .superRefine((value, ctx) => {
    if (value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be after the start date range.",
      });
    }
    if (value.startTime >= value.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "Duration must be positive and end time must be after start time.",
      });
    }
    addMeetingUrlIssue(ctx, value.liveLessonUrl, value.meetingProvider);
  });

function normalizeLessonForm(formData: FormData) {
  return {
    id: formData.get("id")?.toString() ?? formData.get("lessonId")?.toString() ?? "",
    classGroupId: formData.get("classGroupId")?.toString() ?? "",
    title: formData.get("title")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    startAt: formData.get("startAt")?.toString() ?? "",
    endAt: formData.get("endAt")?.toString() ?? "",
    timezone: formData.get("timezone")?.toString() ?? "Africa/Nairobi",
    teacherId: formData.get("teacherId")?.toString() ?? "",
    subjectId: formData.get("subjectId")?.toString() ?? "",
    liveLessonUrl: formData.get("liveLessonUrl")?.toString() ?? "",
    meetingProvider: formData.get("meetingProvider")?.toString() ?? "",
    reminderMinutesBefore: formData.get("reminderMinutesBefore")?.toString() ?? "60",
  };
}

function normalizeIdForm(formData: FormData) {
  return {
    id: formData.get("id")?.toString() ?? formData.get("lessonId")?.toString() ?? "",
    classGroupId: formData.get("classGroupId")?.toString() ?? "",
  };
}

function normalizeMeetingLinkForm(formData: FormData) {
  return {
    lessonId: formData.get("lessonId")?.toString() ?? "",
    classGroupId: formData.get("classGroupId")?.toString() ?? "",
    meetingProvider: formData.get("meetingProvider")?.toString() ?? "",
    liveLessonUrl: formData.get("liveLessonUrl")?.toString() ?? "",
  };
}

function normalizeRecurringForm(formData: FormData) {
  return {
    classGroupId: formData.get("classGroupId")?.toString() ?? "",
    title: formData.get("title")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    startDate: formData.get("startDate")?.toString() ?? "",
    endDate: formData.get("endDate")?.toString() ?? "",
    weekdays: formData.getAll("weekdays").map((value) => value.toString()),
    startTime: formData.get("startTime")?.toString() ?? "",
    endTime: formData.get("endTime")?.toString() ?? "",
    timezone: formData.get("timezone")?.toString() ?? "Africa/Nairobi",
    teacherId: formData.get("teacherId")?.toString() ?? "",
    subjectId: formData.get("subjectId")?.toString() ?? "",
    liveLessonUrl: formData.get("liveLessonUrl")?.toString() ?? "",
    meetingProvider: formData.get("meetingProvider")?.toString() ?? "",
  };
}

function failureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function availabilityFailureMessage(reason: string) {
  if (reason === "OUTSIDE_AVAILABILITY") {
    return "Teacher is not available at this time. The lesson is outside weekly availability.";
  }
  if (reason === "UNAVAILABLE_PERIOD") {
    return "Teacher is not available at this time. The lesson overlaps an unavailable period.";
  }
  if (reason === "ALREADY_BOOKED") {
    return "Teacher is not available at this time. The teacher is already booked.";
  }
  return "Teacher is not available at this time.";
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
      result: LessonActionResult;
    }
> {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    return { success: true, uid: session.uid };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return {
      success: false,
      result: { success: false, message: failureMessage(error, fallback) },
    };
  }
}

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error) {
    if (error instanceof Error && /static generation store missing/i.test(error.message)) return;
    throw error;
  }
}

function revalidateLessonPaths(classGroupId?: string | null, lessonId?: string | null) {
  safeRevalidatePath("/admin/classes");
  if (classGroupId) {
    safeRevalidatePath(`/admin/classes/${classGroupId}`);
    safeRevalidatePath(`/admin/classes/${classGroupId}/lessons`);
    if (lessonId) {
      safeRevalidatePath(`/admin/classes/${classGroupId}/lessons/${lessonId}`);
      safeRevalidatePath(`/admin/classes/${classGroupId}/lessons/${lessonId}/edit`);
    }
  }
  if (lessonId) {
    safeRevalidatePath(`/admin/lessons/${lessonId}`);
    safeRevalidatePath(`/admin/lessons/${lessonId}/edit`);
  }
  safeRevalidatePath("/portal/schedule");
  safeRevalidatePath("/portal/teacher");
  safeRevalidatePath("/portal/teacher/schedule");
  safeRevalidatePath("/portal/student");
  safeRevalidatePath("/portal/student/schedule");
  safeRevalidatePath("/portal/parent");
}

type LessonAuditSource = {
  id?: unknown;
  classGroupId?: unknown;
  teacherId?: unknown;
  status?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  liveLessonUrl?: unknown;
  meetingProvider?: unknown;
  googleCalendarEventId?: unknown;
  googleMeetSpaceName?: unknown;
  meetingCreatedAt?: unknown;
  meetingUpdatedAt?: unknown;
};

function lessonAuditMeta(lesson: LessonAuditSource) {
  return {
    classGroupId: lesson.classGroupId ?? null,
    teacherId: lesson.teacherId ?? null,
    status: lesson.status ?? LessonStatus.SCHEDULED,
    startAt: lesson.startAt,
    endAt: lesson.endAt,
  };
}

function googleMeetAuditMeta(lesson: LessonAuditSource) {
  return {
    ...lessonAuditMeta(lesson),
    googleCalendarEventId: lesson.googleCalendarEventId ?? null,
    googleMeetSpaceName: lesson.googleMeetSpaceName ?? null,
    liveLessonUrl: lesson.liveLessonUrl ?? null,
    meetingCreatedAt: lesson.meetingCreatedAt ?? null,
    meetingProvider: lesson.meetingProvider ?? MeetingProvider.GOOGLE_MEET,
    meetingUpdatedAt: lesson.meetingUpdatedAt ?? null,
  };
}

function auditField(source: unknown, field: string) {
  if (typeof source !== "object" || source === null || !(field in source)) return null;
  return (source as Record<string, unknown>)[field];
}

function auditString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

type LessonMeetingUpdate = {
  liveLessonUrl?: string | null;
  meetingProvider?: MeetingProvider;
  googleCalendarEventId?: string | null;
  googleMeetSpaceName?: string | null;
  meetingCreatedAt?: Date | null;
  meetingUpdatedAt?: Date | null;
};

function shouldAutoCreateGoogleMeet(input: {
  meetingProvider: MeetingProvider;
  liveLessonUrl: string;
}) {
  return input.meetingProvider === MeetingProvider.GOOGLE_MEET && !input.liveLessonUrl;
}

function googleMeetErrorMessage(error: unknown, fallback: string) {
  const message = failureMessage(error, fallback);
  return /google|calendar|meet/i.test(message) ? message : `${fallback} ${message}`;
}

function lessonActionErrorMessage(error: unknown, fallback: string) {
  const message = failureMessage(error, fallback);
  return message.startsWith("Teacher is not available at this time.")
    ? message
    : googleMeetErrorMessage(error, fallback);
}

function buildGoogleLessonInput(
  lesson: {
    id: string;
    classGroupId?: string | null;
    title: string;
    description?: string | null;
    startAt: Date;
    endAt: Date;
    timezone?: string | null;
    googleCalendarEventId?: string | null;
    googleMeetSpaceName?: string | null;
  },
  overrides: Partial<{
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date;
    timezone: string | null;
  }> = {},
) {
  return {
    description: overrides.description ?? lesson.description ?? null,
    endAt: overrides.endAt ?? lesson.endAt,
    classGroupId: lesson.classGroupId ?? null,
    googleCalendarEventId: lesson.googleCalendarEventId ?? null,
    googleMeetSpaceName: lesson.googleMeetSpaceName ?? null,
    lessonId: lesson.id,
    startAt: overrides.startAt ?? lesson.startAt,
    timezone: overrides.timezone ?? lesson.timezone ?? "Africa/Nairobi",
    title: overrides.title ?? lesson.title,
  };
}

function meetingUpdateFromGoogle(
  metadata: {
    liveLessonUrl: string | null;
    googleCalendarEventId: string | null;
    googleMeetSpaceName: string | null;
    meetingUpdatedAt?: Date;
  },
  options: { includeCreatedAt?: boolean } = {},
): LessonMeetingUpdate {
  const timestamp = metadata.meetingUpdatedAt ?? new Date();
  return {
    googleCalendarEventId: metadata.googleCalendarEventId,
    googleMeetSpaceName: metadata.googleMeetSpaceName,
    liveLessonUrl: metadata.liveLessonUrl,
    meetingCreatedAt: options.includeCreatedAt ? timestamp : undefined,
    meetingProvider: MeetingProvider.GOOGLE_MEET,
    meetingUpdatedAt: timestamp,
  };
}

function isFlashRequest(formData: FormData) {
  return formData.get("flash")?.toString() === "true";
}

function redirectTarget(
  formData: FormData,
  field: "successRedirect" | "errorRedirect",
  fallback: string,
) {
  const target = formData.get(field)?.toString();
  return target?.startsWith("/") ? target : fallback;
}

function redirectWithMessage(target: string, message: string, key = "classMessage"): never {
  const separator = target.includes("?") ? "&" : "?";
  redirect(`${target}${separator}${key}=${encodeURIComponent(message)}`);
}

function maybeRedirectSuccess(formData: FormData, message: string, fallback: string): void {
  if (isFlashRequest(formData)) {
    redirectWithMessage(redirectTarget(formData, "successRedirect", fallback), message);
  }
}

function maybeRedirectError(formData: FormData, message: string, fallback: string): void {
  if (isFlashRequest(formData)) {
    redirectWithMessage(redirectTarget(formData, "errorRedirect", fallback), message, "classError");
  }
}

async function writeLessonAudit(
  input: {
    adminUserId: string;
    action: string;
    targetId: string | null;
    before: unknown;
    after: unknown;
    meta: Record<string, unknown>;
  },
  tx: Parameters<typeof createAdminAuditLog>[1],
) {
  const payload = {
    adminUserId: input.adminUserId,
    action: input.action,
    targetType: "lesson",
    targetId: input.targetId,
    before: input.before,
    after: input.after,
    meta: input.meta,
  };
  await createAdminAuditLog(payload, tx);
}

async function writeClassGroupLessonAudit(
  input: {
    adminUserId: string;
    action:
      | "CLASS_GROUP_LESSON_CREATED"
      | "CLASS_GROUP_LESSON_UPDATED"
      | "CLASS_GROUP_LESSON_DELETED";
    classGroupId: unknown;
    lessonId: unknown;
    before: unknown;
    after: unknown;
    meta?: Record<string, unknown>;
  },
  tx: Parameters<typeof createAdminAuditLog>[1],
) {
  const classGroupId = auditString(input.classGroupId);
  if (!classGroupId) return;

  await createAdminAuditLog(
    {
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: "class_group",
      targetId: classGroupId,
      before: input.before,
      after: input.after,
      meta: {
        actorRole: UserRole.ADMIN,
        ...input.meta,
        classGroupId,
        lessonId: auditString(input.lessonId) ?? input.lessonId ?? null,
      },
    },
    tx,
  );
}

async function resolveAvailabilityTeacherId(
  input: { teacherId?: string | null; classGroupId: string },
  tx: typeof prisma | Parameters<typeof checkTeacherAvailability>[1],
) {
  if (input.teacherId) return input.teacherId;
  if (!tx || !("classGroup" in tx)) return null;
  const classGroup = await tx.classGroup.findUnique({
    where: { id: input.classGroupId },
    select: { teacherId: true },
  });
  return classGroup?.teacherId ?? null;
}

async function assertTeacherAvailabilityForLesson(
  input: {
    classGroupId: string;
    teacherId?: string | null;
    startAt: Date;
    endAt: Date;
    excludeLessonId?: string;
  },
  tx: Parameters<typeof checkTeacherAvailability>[1],
) {
  const teacherId = await resolveAvailabilityTeacherId(input, tx);
  if (!teacherId) return;
  const availability = await checkTeacherAvailability(
    {
      teacherId,
      startAt: input.startAt,
      endAt: input.endAt,
      excludeLessonId: input.excludeLessonId,
    },
    tx,
  );
  if (!availability.available) {
    throw new Error(availabilityFailureMessage(availability.reason));
  }
}

export async function createLessonAction(formData: FormData): Promise<LessonActionResult> {
  const session = await requireAdmin("Failed to create lesson.");
  if (!session.success) return session.result;

  const parsed = lessonSchema.safeParse(normalizeLessonForm(formData));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const lessonInput = normalizeRequiredMeetingUrl(parsed.data);
  const autoCreateGoogleMeet = shouldAutoCreateGoogleMeet(lessonInput);
  if (autoCreateGoogleMeet && !isGoogleCalendarEnabled()) {
    return {
      success: false,
      message:
        "Google Calendar is disabled. Provide a manual Google Meet link before creating the lesson.",
    };
  }

  try {
    const lesson = await prisma.$transaction(async (tx) => {
      await assertTeacherAvailabilityForLesson(lessonInput, tx);
      const created = await createLesson(
        { ...lessonInput, allowPendingGoogleMeet: autoCreateGoogleMeet },
        tx,
      );
      let finalLesson = created;

      if (autoCreateGoogleMeet) {
        const metadata = await createGoogleMeetEventForLesson(buildGoogleLessonInput(created));
        const meetingUpdate = meetingUpdateFromGoogle(metadata, { includeCreatedAt: true });
        const updated = await updateLesson(created.id, meetingUpdate, tx);
        finalLesson = updated;
        await writeLessonAudit(
          {
            adminUserId: session.uid,
            action: "LESSON_GOOGLE_MEET_CREATED",
            targetId: created.id,
            before: created,
            after: finalLesson,
            meta: googleMeetAuditMeta(finalLesson),
          },
          tx,
        );
      }

      await writeLessonAudit(
        {
          adminUserId: session.uid,
          action: "LESSON_CREATED",
          targetId: finalLesson.id,
          before: null,
          after: finalLesson,
          meta: lessonAuditMeta(finalLesson),
        },
        tx,
      );
      await writeClassGroupLessonAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_LESSON_CREATED",
          classGroupId: auditField(finalLesson, "classGroupId") ?? lessonInput.classGroupId,
          lessonId: auditField(finalLesson, "id") ?? finalLesson.id,
          before: null,
          after: finalLesson,
          meta: lessonAuditMeta(finalLesson),
        },
        tx,
      );
      return finalLesson;
    }, LESSON_TRANSACTION_OPTIONS);

    revalidateLessonPaths(lesson.classGroupId, lesson.id);
    maybeRedirectSuccess(formData, "Lesson created.", `/admin/classes/${lesson.classGroupId}`);
    return { success: true, message: "Lesson created." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = lessonActionErrorMessage(error, "Failed to create lesson.");
    maybeRedirectError(formData, message, `/admin/classes/${lessonInput.classGroupId}/lessons/new`);
    return { success: false, message };
  }
}

export async function updateLessonAction(formData: FormData): Promise<LessonActionResult> {
  const session = await requireAdmin("Failed to update lesson.");
  if (!session.success) return session.result;

  const parsed = lessonUpdateSchema.safeParse(normalizeLessonForm(formData));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const lessonInput = normalizeRequiredMeetingUrl(parsed.data);

  const hasExplicitRescheduleIntent = formData.get("intent")?.toString() === "reschedule";

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await assertTeacherAvailabilityForLesson(
        { ...lessonInput, excludeLessonId: lessonInput.id },
        tx,
      );
      const existingLesson = await getLessonById(lessonInput.id, tx);
      let meetingUpdate: LessonMeetingUpdate = {};
      if (existingLesson?.googleCalendarEventId) {
        const metadata = await updateGoogleMeetEventForLesson(
          buildGoogleLessonInput(existingLesson, {
            description: lessonInput.description,
            endAt: lessonInput.endAt,
            startAt: lessonInput.startAt,
            timezone: lessonInput.timezone,
            title: lessonInput.title,
          }),
        );
        meetingUpdate = meetingUpdateFromGoogle(metadata);
      }
      let shouldReschedule = hasExplicitRescheduleIntent;

      if (!shouldReschedule && "scheduledClass" in tx) {
        const existing = await tx.scheduledClass.findUnique({
          where: { id: lessonInput.id },
          select: { startAt: true, endAt: true },
        });
        shouldReschedule =
          !!existing &&
          (existing.startAt.getTime() !== lessonInput.startAt.getTime() ||
            existing.endAt.getTime() !== lessonInput.endAt.getTime());
      }

      const result = shouldReschedule
        ? await rescheduleLesson(
            lessonInput.id,
            {
              startAt: lessonInput.startAt,
              endAt: lessonInput.endAt,
              teacherId: lessonInput.teacherId,
              liveLessonUrl: lessonInput.liveLessonUrl,
              ...meetingUpdate,
            },
            tx,
          )
        : await updateLesson(lessonInput.id, { ...lessonInput, ...meetingUpdate }, tx);
      await writeLessonAudit(
        {
          adminUserId: session.uid,
          action: shouldReschedule ? "LESSON_RESCHEDULED" : "LESSON_UPDATED",
          targetId: lessonInput.id,
          before: result.before,
          after: result.after,
          meta: lessonAuditMeta(result.after),
        },
        tx,
      );
      await writeClassGroupLessonAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_LESSON_UPDATED",
          classGroupId: auditField(result.after, "classGroupId") ?? lessonInput.classGroupId,
          lessonId: auditField(result.after, "id") ?? lessonInput.id,
          before: result.before,
          after: result.after,
          meta: lessonAuditMeta(result.after),
        },
        tx,
      );
      if (
        result.before &&
        result.after &&
        "liveLessonUrl" in result.before &&
        "liveLessonUrl" in result.after &&
        result.before.liveLessonUrl !== result.after.liveLessonUrl
      ) {
        await writeLessonAudit(
          {
            adminUserId: session.uid,
            action: "LESSON_MEETING_LINK_UPDATED",
            targetId: lessonInput.id,
            before: result.before,
            after: result.after,
            meta: lessonAuditMeta(result.after),
          },
          tx,
        );
      }
      if (existingLesson?.googleCalendarEventId) {
        await writeLessonAudit(
          {
            adminUserId: session.uid,
            action: "LESSON_GOOGLE_MEET_UPDATED",
            targetId: lessonInput.id,
            before: result.before,
            after: result.after,
            meta: googleMeetAuditMeta(result.after),
          },
          tx,
        );
      }
      return { result, wasRescheduled: shouldReschedule };
    }, LESSON_TRANSACTION_OPTIONS);

    revalidateLessonPaths(updated.result.classGroupId, updated.result.id);
    const message = updated.wasRescheduled ? "Lesson rescheduled." : "Lesson updated.";
    maybeRedirectSuccess(formData, message, `/admin/classes/${updated.result.classGroupId}`);
    return { success: true, message };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = lessonActionErrorMessage(error, "Failed to update lesson.");
    maybeRedirectError(
      formData,
      message,
      `/admin/classes/${lessonInput.classGroupId}/lessons/${lessonInput.id}/edit`,
    );
    return { success: false, message };
  }
}

export async function rescheduleLessonAction(formData: FormData): Promise<LessonActionResult> {
  const session = await requireAdmin("Failed to reschedule lesson.");
  if (!session.success) return session.result;

  const parsed = lessonUpdateSchema.safeParse(normalizeLessonForm(formData));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const lessonInput = normalizeRequiredMeetingUrl(parsed.data);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await assertTeacherAvailabilityForLesson(
        { ...lessonInput, excludeLessonId: lessonInput.id },
        tx,
      );
      const existingLesson = await getLessonById(lessonInput.id, tx);
      let meetingUpdate: LessonMeetingUpdate = {};
      if (existingLesson?.googleCalendarEventId) {
        const metadata = await updateGoogleMeetEventForLesson(
          buildGoogleLessonInput(existingLesson, {
            description: lessonInput.description,
            endAt: lessonInput.endAt,
            startAt: lessonInput.startAt,
            timezone: lessonInput.timezone,
            title: lessonInput.title,
          }),
        );
        meetingUpdate = meetingUpdateFromGoogle(metadata);
      }
      const result = await rescheduleLesson(
        lessonInput.id,
        {
          startAt: lessonInput.startAt,
          endAt: lessonInput.endAt,
          teacherId: lessonInput.teacherId,
          liveLessonUrl: lessonInput.liveLessonUrl,
          ...meetingUpdate,
        },
        tx,
      );
      await writeLessonAudit(
        {
          adminUserId: session.uid,
          action: "LESSON_RESCHEDULED",
          targetId: lessonInput.id,
          before: result.before,
          after: result.after,
          meta: lessonAuditMeta(result.after),
        },
        tx,
      );
      await writeClassGroupLessonAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_LESSON_UPDATED",
          classGroupId: auditField(result.after, "classGroupId") ?? lessonInput.classGroupId,
          lessonId: auditField(result.after, "id") ?? lessonInput.id,
          before: result.before,
          after: result.after,
          meta: lessonAuditMeta(result.after),
        },
        tx,
      );
      if (existingLesson?.googleCalendarEventId) {
        await writeLessonAudit(
          {
            adminUserId: session.uid,
            action: "LESSON_GOOGLE_MEET_UPDATED",
            targetId: lessonInput.id,
            before: result.before,
            after: result.after,
            meta: googleMeetAuditMeta(result.after),
          },
          tx,
        );
      }
      return result;
    }, LESSON_TRANSACTION_OPTIONS);

    revalidateLessonPaths(updated.classGroupId, updated.id);
    maybeRedirectSuccess(formData, "Lesson rescheduled.", `/admin/classes/${updated.classGroupId}`);
    return { success: true, message: "Lesson rescheduled." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = lessonActionErrorMessage(error, "Failed to reschedule lesson.");
    maybeRedirectError(
      formData,
      message,
      `/admin/classes/${lessonInput.classGroupId}/lessons/${lessonInput.id}/edit`,
    );
    return { success: false, message };
  }
}

export async function updateLessonMeetingLinkAction(
  formData: FormData,
): Promise<LessonActionResult> {
  const session = await requireAdmin("Failed to update meeting link.");
  if (!session.success) return session.result;

  const parsed = meetingLinkSchema.safeParse(normalizeMeetingLinkForm(formData));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const liveLessonUrl = normalizeLiveLessonUrl(parsed.data.liveLessonUrl);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await updateLessonMeetingLink(
        parsed.data.lessonId,
        {
          meetingProvider: parsed.data.meetingProvider,
          liveLessonUrl,
          meetingUpdatedAt: new Date(),
        },
        tx,
      );
      await writeLessonAudit(
        {
          adminUserId: session.uid,
          action: "LESSON_MEETING_LINK_UPDATED",
          targetId: parsed.data.lessonId,
          before: result.before,
          after: result.after,
          meta: lessonAuditMeta(result.after),
        },
        tx,
      );
      return result;
    }, LESSON_TRANSACTION_OPTIONS);

    revalidateLessonPaths(updated.classGroupId ?? parsed.data.classGroupId, updated.id);
    maybeRedirectSuccess(
      formData,
      "Lesson meeting link updated.",
      `/admin/classes/${updated.classGroupId ?? parsed.data.classGroupId}/lessons/${updated.id}`,
    );
    return { success: true, message: "Lesson meeting link updated." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = failureMessage(error, "Failed to update meeting link.");
    maybeRedirectError(
      formData,
      message,
      `/admin/classes/${parsed.data.classGroupId ?? ""}/lessons/${parsed.data.lessonId}/edit`,
    );
    return { success: false, message };
  }
}

export async function cancelLessonAction(formData: FormData): Promise<LessonActionResult> {
  const session = await requireAdmin("Failed to cancel lesson.");
  if (!session.success) return session.result;

  const parsed = cancelSchema.safeParse({
    ...normalizeIdForm(formData),
    cancelReason: formData.get("cancelReason")?.toString() ?? "",
  });
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await cancelLesson(parsed.data.id, parsed.data.cancelReason, tx);
      if (result.after?.googleCalendarEventId) {
        await deleteGoogleMeetEventForLesson({
          googleCalendarEventId: result.after.googleCalendarEventId,
          lessonId: parsed.data.id,
          mode: "cancel",
        });
        await writeLessonAudit(
          {
            adminUserId: session.uid,
            action: "LESSON_GOOGLE_MEET_DELETED",
            targetId: parsed.data.id,
            before: result.before,
            after: result.after,
            meta: googleMeetAuditMeta(result.after),
          },
          tx,
        );
      }
      await writeLessonAudit(
        {
          adminUserId: session.uid,
          action: "LESSON_CANCELLED",
          targetId: parsed.data.id,
          before: result.before,
          after: result.after,
          meta: lessonAuditMeta(result.after),
        },
        tx,
      );
      return result;
    }, LESSON_TRANSACTION_OPTIONS);

    revalidateLessonPaths(updated.classGroupId, updated.id);
    maybeRedirectSuccess(formData, "Lesson cancelled.", `/admin/classes/${updated.classGroupId}`);
    return { success: true, message: "Lesson cancelled." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = googleMeetErrorMessage(error, "Failed to cancel lesson.");
    maybeRedirectError(
      formData,
      message,
      `/admin/classes/${parsed.data.classGroupId}/lessons/${parsed.data.id}`,
    );
    return { success: false, message };
  }
}

export async function completeLessonAction(formData: FormData): Promise<LessonActionResult> {
  const session = await requireAdmin("Failed to complete lesson.");
  if (!session.success) return session.result;

  const parsed = idSchema.safeParse(normalizeIdForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await completeLesson(parsed.data.id, tx);
      await writeLessonAudit(
        {
          adminUserId: session.uid,
          action: "LESSON_COMPLETED",
          targetId: parsed.data.id,
          before: result.before,
          after: result.after,
          meta: lessonAuditMeta(result.after),
        },
        tx,
      );
      return result;
    }, LESSON_TRANSACTION_OPTIONS);

    revalidateLessonPaths(updated.classGroupId, updated.id);
    maybeRedirectSuccess(formData, "Lesson completed.", `/admin/classes/${updated.classGroupId}`);
    return { success: true, message: "Lesson completed." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = failureMessage(error, "Failed to complete lesson.");
    maybeRedirectError(
      formData,
      message,
      `/admin/classes/${parsed.data.classGroupId}/lessons/${parsed.data.id}`,
    );
    return { success: false, message };
  }
}

export async function deleteLessonAction(formData: FormData): Promise<LessonActionResult> {
  const session = await requireAdmin("Failed to delete lesson.");
  if (!session.success) return session.result;

  const parsed = idSchema.safeParse(normalizeIdForm(formData));
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors };

  try {
    await prisma.$transaction(async (tx) => {
      const before = await getLessonById(parsed.data.id, tx);
      if (before?.googleCalendarEventId) {
        await deleteGoogleMeetEventForLesson({
          googleCalendarEventId: before.googleCalendarEventId,
          lessonId: parsed.data.id,
          mode: "delete",
        });
        await writeLessonAudit(
          {
            adminUserId: session.uid,
            action: "LESSON_GOOGLE_MEET_DELETED",
            targetId: parsed.data.id,
            before,
            after: { deleted: true },
            meta: googleMeetAuditMeta(before),
          },
          tx,
        );
      }
      const removed = await deleteLesson(parsed.data.id, tx);
      await writeLessonAudit(
        {
          adminUserId: session.uid,
          action: "LESSON_DELETED",
          targetId: parsed.data.id,
          before: before ?? removed,
          after: { deleted: true },
          meta: lessonAuditMeta(
            before ?? {
              classGroupId: null,
              teacherId: null,
              status: LessonStatus.SCHEDULED,
              startAt: null,
              endAt: null,
            },
          ),
        },
        tx,
      );
      const classGroupAuditSource = before ?? removed;
      await writeClassGroupLessonAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_LESSON_DELETED",
          classGroupId:
            auditField(classGroupAuditSource, "classGroupId") ?? parsed.data.classGroupId,
          lessonId: auditField(classGroupAuditSource, "id") ?? parsed.data.id,
          before: before ?? removed,
          after: { deleted: true },
          meta: lessonAuditMeta(
            (classGroupAuditSource ?? {
              classGroupId: parsed.data.classGroupId,
              teacherId: null,
              status: LessonStatus.SCHEDULED,
              startAt: null,
              endAt: null,
            }) as LessonAuditSource,
          ),
        },
        tx,
      );
    }, LESSON_TRANSACTION_OPTIONS);

    revalidateLessonPaths(parsed.data.classGroupId, parsed.data.id);
    maybeRedirectSuccess(formData, "Lesson deleted.", `/admin/classes/${parsed.data.classGroupId}`);
    return { success: true, message: "Lesson deleted." };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = googleMeetErrorMessage(error, "Failed to delete lesson.");
    maybeRedirectError(
      formData,
      message,
      `/admin/classes/${parsed.data.classGroupId}/lessons/${parsed.data.id}`,
    );
    return { success: false, message };
  }
}

export async function createRecurringLessonsAction(
  formData: FormData,
): Promise<LessonActionResult> {
  const session = await requireAdmin("Failed to create recurring lessons.");
  if (!session.success) return session.result;

  const parsed = recurringSchema.safeParse(normalizeRecurringForm(formData));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const recurringInput = normalizeRequiredMeetingUrl(parsed.data);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const created = await createRecurringLessons(recurringInput, tx);
      const firstLesson = created.created[0];
      await writeLessonAudit(
        {
          adminUserId: session.uid,
          action: "LESSON_BULK_CREATED",
          targetId: firstLesson?.id ?? null,
          before: null,
          after: {
            createdCount: created.createdCount,
            skippedCount: created.skippedCount,
            createdLessonIds: created.created.map((lesson) => lesson.id),
          },
          meta: lessonAuditMeta(
            firstLesson ?? {
              classGroupId: recurringInput.classGroupId,
              teacherId: recurringInput.teacherId,
              status: LessonStatus.SCHEDULED,
              startAt: recurringInput.startDate,
              endAt: recurringInput.endDate,
            },
          ),
        },
        tx,
      );
      return created;
    }, LESSON_TRANSACTION_OPTIONS);

    revalidateLessonPaths(recurringInput.classGroupId, result.created[0]?.id);
    const message = `Created ${result.createdCount} recurring lessons; ${result.createdCount} created, ${result.skippedCount} skipped; skipped ${result.skippedCount}.`;
    maybeRedirectSuccess(formData, message, `/admin/classes/${recurringInput.classGroupId}`);
    return {
      success: true,
      message,
    };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = failureMessage(error, "Failed to create recurring lessons.");
    maybeRedirectError(
      formData,
      message,
      `/admin/classes/${recurringInput.classGroupId}/lessons/new`,
    );
    return {
      success: false,
      message,
    };
  }
}
