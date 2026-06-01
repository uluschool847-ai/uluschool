import { type Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { listAttendanceHistoryForStudent } from "@/lib/repositories/attendance-repository";
import { getTeacherStudentGradebook } from "@/lib/repositories/gradebook-repository";
import { listProgressNotesForTeacherStudent } from "@/lib/repositories/student-progress-repository";
import { renderReportSnapshotPdf } from "@/lib/services/report-pdf";
import { createStorageService } from "@/lib/storage";

type ReportDatabase = typeof prisma | Prisma.TransactionClient;

type ReportFilters = {
  classGroupId?: string;
  pdf?: string;
  search?: string;
  sort?: string;
  studentId?: string;
  termId?: string;
};

type SnapshotInput = {
  academicTermId: string;
  classGroupId: string;
  snapshotData: Record<string, unknown>;
  studentId: string;
  teacherComment?: string | null;
};

function asDate(value: unknown) {
  return value instanceof Date ? value : new Date(String(value));
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getDateOrNull(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compareNullableStrings(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function includesText(value: unknown, search: string) {
  const haystack = String(value ?? "").toLowerCase();
  const needle = search.toLowerCase();
  return haystack.includes(needle) || haystack.includes(needle.replace(/e$/, ""));
}

function countAttendance(records: Array<Record<string, unknown>>) {
  return records.reduce<{ present: number; late: number; absent: number }>(
    (summary, record) => {
      if (record.status === "PRESENT") summary.present += 1;
      if (record.status === "LATE") summary.late += 1;
      if (record.status === "ABSENT") summary.absent += 1;
      return summary;
    },
    { present: 0, late: 0, absent: 0 },
  );
}

function mapSnapshot(snapshot: Record<string, unknown>, baseHref: string) {
  const data = getRecord(snapshot.snapshotData);
  const student = getRecord(data.student);
  const term = getRecord(data.academicTerm ?? data.term);
  const classGroup = getRecord(data.classGroup);
  const grades = getRecord(data.grades);
  const teacherComment = getString(data.teacherComment) || getString(snapshot.teacherComment);
  const weightedTermAverage = grades.weightedTermAverage ?? null;
  const pdfGeneratedAt = getDateOrNull(snapshot.pdfGeneratedAt);
  return {
    academicTerm: {
      id: getString(term.id) || getString(snapshot.academicTermId),
      name: getString(term.name),
    },
    id: String(snapshot.id),
    student: {
      email: getString(student.email),
      fullName: getString(student.fullName),
      id: getString(student.id) || getString(snapshot.studentId),
    },
    studentName: getString(student.fullName),
    childName: getString(student.fullName),
    classGroup: {
      id: getString(classGroup.id) || getString(snapshot.classGroupId),
      name: getString(classGroup.name),
    },
    classGroupName: getString(classGroup.name),
    academicTermName: getString(term.name),
    teacherCommentPreview: teacherComment,
    weightedTermAverage,
    generatedAt: asDate(snapshot.generatedAt),
    pdfAvailable: Boolean(snapshot.pdfStorageKey),
    pdfStorageKey: typeof snapshot.pdfStorageKey === "string" ? snapshot.pdfStorageKey : null,
    pdfGeneratedAt,
    href: `${baseHref}/${snapshot.id}`,
  };
}

type ReportSnapshotRow = ReturnType<typeof mapSnapshot>;

function matchesReportSearch(snapshot: ReportSnapshotRow, search?: string) {
  const query = search?.trim();
  if (!query) return true;

  return (
    includesText(snapshot.academicTerm.name, query) ||
    includesText(snapshot.academicTermName, query) ||
    includesText(snapshot.classGroup.name, query) ||
    includesText(snapshot.classGroupName, query) ||
    includesText(snapshot.student.fullName, query) ||
    includesText(snapshot.teacherCommentPreview, query)
  );
}

function sortReportRows(rows: ReportSnapshotRow[], sort?: string) {
  const sorted = [...rows];
  switch (sort) {
    case "generatedAtAsc":
      return sorted.sort((left, right) => left.generatedAt.getTime() - right.generatedAt.getTime());
    case "term":
      return sorted.sort((left, right) =>
        compareNullableStrings(left.academicTerm.name, right.academicTerm.name),
      );
    case "classGroup":
      return sorted.sort((left, right) =>
        compareNullableStrings(left.classGroup.name, right.classGroup.name),
      );
    case "average":
      return sorted.sort(
        (left, right) =>
          (getNumberOrNull(right.weightedTermAverage) ?? Number.NEGATIVE_INFINITY) -
          (getNumberOrNull(left.weightedTermAverage) ?? Number.NEGATIVE_INFINITY),
      );
    default:
      return sorted.sort((left, right) => right.generatedAt.getTime() - left.generatedAt.getTime());
  }
}

function filterPdf(rows: ReportSnapshotRow[], pdf?: string) {
  if (pdf === "available") {
    return rows.filter((row) => row.pdfAvailable);
  }
  if (pdf === "missing") {
    return rows.filter((row) => !row.pdfAvailable);
  }
  return rows;
}

async function assertTeacherOwnsStudent(
  teacherId: string,
  studentId: string,
  database: ReportDatabase = prisma,
) {
  const student = await database.appUser.findFirst({
    where: {
      id: studentId,
      OR: [
        { enrolledClasses: { some: { teacherId } } },
        { enrolledClassGroups: { some: { teacherId } } },
      ],
    } as Prisma.AppUserWhereInput,
    select: { id: true },
  });
  return Boolean(student);
}

export async function buildReportPreview(teacherId: string, studentId: string, termId: string) {
  const gradebook = await getTeacherStudentGradebook(teacherId, studentId, termId);
  if (!gradebook) return null;

  const attendance = (await listAttendanceHistoryForStudent(
    { type: "teacher", teacherId },
    studentId,
    { termId } as Record<string, string>,
  )) as Array<Record<string, unknown>>;
  const progressNotes = await listProgressNotesForTeacherStudent(teacherId, studentId, {
    status: "active",
    termId,
  } as Record<string, string>);

  return {
    student: gradebook.student,
    classGroup: (gradebook as { classGroup?: unknown }).classGroup ?? null,
    academicTerm: gradebook.term,
    grades: {
      categories: gradebook.categories,
      homeworkGrades: gradebook.homeworkGrades,
      manualGrades: gradebook.manualGrades,
      weightedTermAverage: gradebook.termAverage,
    },
    attendance: countAttendance(attendance),
    attendanceHistory: attendance,
    progressNotes,
    generatedByTeacherId: teacherId,
    generatedAt: new Date(),
    snapshotVersion: 1,
  };
}

export async function getTeacherReportOptions(
  teacherId: string,
  database: ReportDatabase = prisma,
) {
  const [terms, classGroups, students] = await Promise.all([
    database.academicTerm.findMany({
      where: { isActive: true },
      orderBy: [{ startDate: "desc" }],
      select: { id: true, name: true, startDate: true, endDate: true },
    }),
    database.classGroup.findMany({
      where: { teacherId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subject: { select: { name: true } },
        students: {
          select: { id: true, fullName: true, email: true },
          orderBy: { fullName: "asc" },
        },
      },
    }),
    database.appUser.findMany({
      where: {
        OR: [
          { enrolledClasses: { some: { teacherId } } },
          { enrolledClassGroups: { some: { teacherId } } },
        ],
      } as Prisma.AppUserWhereInput,
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true },
    }),
  ]);

  return {
    terms,
    classGroups: classGroups.map((group) => ({
      id: group.id,
      name: group.name,
      subjectName: group.subject?.name ?? "",
      students: group.students,
    })),
    students,
  };
}

export async function saveReportSnapshot(
  teacherId: string,
  input: SnapshotInput,
  database: ReportDatabase = prisma,
) {
  if (!(await assertTeacherOwnsStudent(teacherId, input.studentId, database))) {
    throw new Error("Student is not assigned to this teacher.");
  }

  return database.reportSnapshot.create({
    data: {
      academicTermId: input.academicTermId,
      classGroupId: input.classGroupId,
      generatedByTeacherId: teacherId,
      generatedAt: new Date(),
      snapshotData: input.snapshotData as Prisma.InputJsonValue,
      snapshotVersion: 1,
      studentId: input.studentId,
      teacherComment: input.teacherComment ?? null,
    },
  });
}

export async function getReportSnapshotForTeacher(
  teacherId: string,
  snapshotId: string,
  database: ReportDatabase = prisma,
) {
  return database.reportSnapshot.findFirst({
    where: { id: snapshotId, generatedByTeacherId: teacherId },
  });
}

export async function getReportSnapshotForStudent(
  studentId: string,
  snapshotId: string,
  database: ReportDatabase = prisma,
) {
  return database.reportSnapshot.findFirst({
    where: { id: snapshotId, studentId },
  });
}

export async function getReportSnapshotForParent(
  parentId: string,
  studentId: string,
  snapshotId: string,
  database: ReportDatabase = prisma,
) {
  const parent = await database.appUser.findFirst({
    where: { id: parentId, role: UserRole.PARENT, children: { some: { id: studentId } } },
    select: { id: true },
  });
  if (!parent) return null;
  return database.reportSnapshot.findFirst({
    where: { id: snapshotId, studentId },
  });
}

export async function listReportSnapshotsForTeacher(
  teacherId: string,
  filters: ReportFilters = {},
  database: ReportDatabase = prisma,
) {
  const where: Prisma.ReportSnapshotWhereInput = { generatedByTeacherId: teacherId };
  if (filters.classGroupId) where.classGroupId = filters.classGroupId;
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.termId) where.academicTermId = filters.termId;

  const snapshots = await database.reportSnapshot.findMany({
    where,
    orderBy: { generatedAt: "desc" },
  });
  const rows = snapshots.map((snapshot) =>
    mapSnapshot(snapshot as Record<string, unknown>, "/portal/teacher/reports"),
  );
  return sortReportRows(
    filterPdf(
      rows.filter((snapshot) => matchesReportSearch(snapshot, filters.search)),
      filters.pdf,
    ),
    filters.sort,
  );
}

export async function listReportSnapshotsForStudent(
  studentId: string,
  filters: ReportFilters = {},
  database: ReportDatabase = prisma,
) {
  const where: Prisma.ReportSnapshotWhereInput = { studentId };
  if (filters.termId) where.academicTermId = filters.termId;
  if (filters.classGroupId) where.classGroupId = filters.classGroupId;

  const snapshots = await database.reportSnapshot.findMany({
    where,
    orderBy: { generatedAt: "desc" },
  });
  const rows = snapshots.map((snapshot) =>
    mapSnapshot(snapshot as Record<string, unknown>, "/portal/student/reports"),
  );
  return sortReportRows(
    filterPdf(
      rows.filter(
        (snapshot) =>
          snapshot.student.id === studentId && matchesReportSearch(snapshot, filters.search),
      ),
      filters.pdf,
    ),
    filters.sort,
  );
}

export async function listReportSnapshotsForParentChild(
  parentId: string,
  studentId: string,
  filters: ReportFilters = {},
  database: ReportDatabase = prisma,
) {
  const parent = await database.appUser.findFirst({
    where: { id: parentId, role: UserRole.PARENT, children: { some: { id: studentId } } },
    select: { id: true },
  });
  if (!parent) return [];

  const snapshots = await database.reportSnapshot.findMany({
    where: {
      studentId,
      ...(filters.classGroupId ? { classGroupId: filters.classGroupId } : {}),
      ...(filters.termId ? { academicTermId: filters.termId } : {}),
    },
    orderBy: { generatedAt: "desc" },
  });
  const rows = snapshots.map((snapshot) =>
    mapSnapshot(snapshot as Record<string, unknown>, `/portal/parent/reports/${studentId}`),
  );
  return sortReportRows(
    filterPdf(
      rows.filter(
        (snapshot) =>
          snapshot.student.id === studentId && matchesReportSearch(snapshot, filters.search),
      ),
      filters.pdf,
    ),
    filters.sort,
  );
}

export async function exportReportSnapshotPdf(teacherId: string, snapshotId: string) {
  const snapshot = await getReportSnapshotForTeacher(teacherId, snapshotId);
  if (!snapshot) {
    throw new Error("Report snapshot not found.");
  }
  const rendered = await renderReportSnapshotPdf(snapshot.snapshotData as Record<string, unknown>);
  const storage = createStorageService({ runtimeRole: "TEACHER" });
  const storageKey = await storage.upload(Buffer.from(rendered.bytes), rendered.filename);
  const pdfGeneratedAt = new Date();
  const updatedSnapshot = await prisma.reportSnapshot.update({
    where: { id: snapshot.id },
    data: { pdfGeneratedAt, pdfStorageKey: storageKey },
  });

  return {
    ...rendered,
    publicUrl: storage.getURL(storageKey),
    snapshot: updatedSnapshot,
    storageKey,
  };
}
