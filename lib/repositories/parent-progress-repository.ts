import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  type ProgressListFilters,
  type ProgressNoteViewModel,
  listProgressNotesForStudent,
} from "@/lib/repositories/student-progress-repository";

export type ParentProgressFilters = ProgressListFilters;

export type ParentProgressNoteRow = ProgressNoteViewModel & {
  studentName?: string;
};

const VALID_STATUS = new Set(["active", "archived", "all"]);
const VALID_PERFORMANCE_LEVEL = new Set(["EXCELLENT", "GOOD", "STRUGGLING"]);
const VALID_SORT = new Set(["recordedAtDesc", "recordedAtAsc", "subject", "performanceLevel"]);

function clean(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function normalizeFilters(filters: ParentProgressFilters = {}): ParentProgressFilters {
  const status = clean(filters.status);
  const performanceLevel = clean(filters.performanceLevel);
  const sort = clean(filters.sort);

  return {
    ...(performanceLevel && VALID_PERFORMANCE_LEVEL.has(performanceLevel)
      ? { performanceLevel }
      : {}),
    ...(clean(filters.search) ? { search: clean(filters.search) } : {}),
    ...(sort && VALID_SORT.has(sort) ? { sort } : {}),
    status: status && VALID_STATUS.has(status) ? status : "active",
    ...(clean(filters.subjectId) ? { subjectId: clean(filters.subjectId) } : {}),
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

async function getStudentName(studentId: string) {
  const appUser = prisma.appUser as unknown as {
    findUnique?: (args: {
      select: { fullName: true };
      where: { id: string };
    }) => Promise<{ fullName: string } | null>;
  };

  if (typeof appUser.findUnique !== "function") {
    return null;
  }

  const student = await appUser.findUnique({
    where: { id: studentId },
    select: { fullName: true },
  });

  return student?.fullName ?? null;
}

export async function listProgressNotesForParentChild(
  parentId: string,
  studentId: string,
  filters: ParentProgressFilters = {},
): Promise<ParentProgressNoteRow[]> {
  if (!(await isLinkedParentChild(parentId, studentId))) {
    return [];
  }

  const notes = await listProgressNotesForStudent(studentId, normalizeFilters(filters));
  const studentName = await getStudentName(studentId);

  if (!studentName) {
    return notes;
  }

  return notes.map((note) => ({
    ...note,
    studentName: (note as ParentProgressNoteRow).studentName ?? studentName,
  }));
}
