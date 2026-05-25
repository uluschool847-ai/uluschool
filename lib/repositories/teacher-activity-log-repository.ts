import type { AdminAuditLog, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const TEACHER_ACTIVITY_ACTIONS = [
  "ATTENDANCE_MARKED",
  "ATTENDANCE_UPDATED",
  "MANUAL_GRADE_CREATED",
  "MANUAL_GRADE_UPDATED",
  "MANUAL_GRADE_ARCHIVED",
] as const;

type TeacherActivityAction = (typeof TEACHER_ACTIVITY_ACTIONS)[number];

type TeacherActivityFilters = {
  action?: string;
  classGroupId?: string;
  dateFrom?: string;
  dateTo?: string;
  studentId?: string;
};

type ActivityMeta = {
  classGroupId?: unknown;
  classGroupName?: unknown;
  lessonTitle?: unknown;
  reason?: unknown;
  scheduledClassId?: unknown;
  studentId?: unknown;
  studentName?: unknown;
};

function isTeacherActivityAction(value: string | undefined): value is TeacherActivityAction {
  return TEACHER_ACTIVITY_ACTIONS.includes(value as TeacherActivityAction);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getMeta(log: AdminAuditLog): ActivityMeta {
  if (!log.meta || typeof log.meta !== "object" || Array.isArray(log.meta)) {
    return {};
  }
  return log.meta as ActivityMeta;
}

function parseDateFrom(value: string | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTo(value: string | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildCreatedAtFilter(filters: TeacherActivityFilters) {
  const gte = parseDateFrom(filters.dateFrom);
  const lte = parseDateTo(filters.dateTo);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

function actionLabel(action: string) {
  switch (action) {
    case "ATTENDANCE_MARKED":
      return "Attendance marked";
    case "ATTENDANCE_UPDATED":
      return "Attendance updated";
    case "MANUAL_GRADE_CREATED":
      return "Manual grade created";
    case "MANUAL_GRADE_UPDATED":
      return "Manual grade updated";
    case "MANUAL_GRADE_ARCHIVED":
      return "Manual grade archived";
    default:
      return "Activity";
  }
}

function safeSummary(action: string) {
  switch (action) {
    case "ATTENDANCE_MARKED":
      return "Attendance was marked";
    case "ATTENDANCE_UPDATED":
      return "Attendance was updated";
    case "MANUAL_GRADE_CREATED":
      return "Manual grade was created";
    case "MANUAL_GRADE_UPDATED":
      return "Manual grade was updated";
    case "MANUAL_GRADE_ARCHIVED":
      return "Manual grade was archived";
    default:
      return "Teacher activity";
  }
}

function jsonPathFilter(path: "studentId" | "classGroupId", equals: string) {
  return {
    meta: {
      path: [path],
      equals,
    },
  } satisfies Prisma.AdminAuditLogWhereInput;
}

export async function listTeacherActivityLog(
  teacherId: string,
  filters: TeacherActivityFilters = {},
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const andFilters: Prisma.AdminAuditLogWhereInput[] = [];
  if (filters.studentId) {
    andFilters.push(jsonPathFilter("studentId", filters.studentId));
  }
  if (filters.classGroupId) {
    andFilters.push(jsonPathFilter("classGroupId", filters.classGroupId));
  }

  const createdAt = buildCreatedAtFilter(filters);
  const where: Prisma.AdminAuditLogWhereInput = {
    actorId: teacherId,
    action: isTeacherActivityAction(filters.action)
      ? filters.action
      : { in: [...TEACHER_ACTIVITY_ACTIONS] },
    ...(createdAt ? { createdAt } : {}),
    ...(andFilters.length > 0 ? { AND: andFilters } : {}),
  };

  const logs = await database.adminAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return logs.map((log) => {
    const meta = getMeta(log);
    return {
      id: log.id,
      action: log.action,
      label: actionLabel(log.action),
      studentName: getString(meta.studentName),
      classGroupName: getString(meta.classGroupName),
      lessonTitle: getString(meta.lessonTitle),
      summary: safeSummary(log.action),
      reason: getString(meta.reason),
      createdAt: log.createdAt,
    };
  });
}
