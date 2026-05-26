import { AttendanceStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  type StudentAttendanceFilters,
  listStudentAttendance,
} from "@/lib/repositories/attendance-repository";

export type ParentAttendanceFilters = {
  classGroupId?: string | null;
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
  scheduledClassId?: string | null;
  search?: string | null;
  sort?: string | null;
  status?: string | null;
  subjectId?: string | null;
};

type ParentAttendanceResult = Awaited<ReturnType<typeof listStudentAttendance>>;

const VALID_STATUS = new Set<string>([
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.ABSENT,
]);

const VALID_SORT = new Set([
  "markedAtDesc",
  "markedAtAsc",
  "lessonDateDesc",
  "lessonDateAsc",
  "status",
  "subject",
]);

const EMPTY_ATTENDANCE_RESULT: ParentAttendanceResult = {
  records: [],
  summary: {
    absent: 0,
    attendanceRate: null,
    late: 0,
    present: 0,
    total: 0,
  },
};

function clean(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function isValidDate(value: string | Date | undefined) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeFilters(filters: ParentAttendanceFilters = {}): StudentAttendanceFilters {
  const classGroupId = clean(filters.classGroupId);
  const dateFrom = clean(filters.dateFrom);
  const dateTo = clean(filters.dateTo);
  const scheduledClassId = clean(filters.scheduledClassId);
  const search = clean(filters.search);
  const sort = clean(filters.sort);
  const status = clean(filters.status);
  const subjectId = clean(filters.subjectId);

  return {
    ...(typeof classGroupId === "string" ? { classGroupId } : {}),
    ...(isValidDate(dateFrom) ? { from: dateFrom } : {}),
    ...(typeof scheduledClassId === "string" ? { scheduledClassId } : {}),
    ...(typeof search === "string" ? { search } : {}),
    ...(typeof sort === "string" && VALID_SORT.has(sort) ? { sort } : {}),
    ...(typeof status === "string" && VALID_STATUS.has(status) ? { status } : {}),
    ...(typeof subjectId === "string" ? { subjectId } : {}),
    ...(isValidDate(dateTo) ? { to: dateTo } : {}),
  };
}

async function isLinkedParentChild(parentId: string, studentId: string) {
  const parent = await prisma.appUser.findFirst({
    where: {
      id: parentId,
      role: UserRole.PARENT,
      children: {
        some: {
          id: studentId,
        },
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(parent);
}

function mapParentLessonLinks(
  attendance: ParentAttendanceResult,
  studentId: string,
): ParentAttendanceResult {
  return {
    ...attendance,
    records: attendance.records.map((record) => ({
      ...record,
      lesson: {
        ...record.lesson,
        detailHref: `/portal/parent/schedule/${studentId}/${record.lesson.id}`,
      },
    })),
  };
}

export async function listAttendanceForParentChild(
  parentId: string,
  studentId: string,
  filters: ParentAttendanceFilters = {},
): Promise<ParentAttendanceResult> {
  if (!(await isLinkedParentChild(parentId, studentId))) {
    return EMPTY_ATTENDANCE_RESULT;
  }

  const attendance = await listStudentAttendance(studentId, normalizeFilters(filters));
  return mapParentLessonLinks(attendance, studentId);
}
