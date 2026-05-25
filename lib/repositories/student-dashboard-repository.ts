import { listStudentAttendance } from "@/lib/repositories/attendance-repository";
import { listStudentCourseMaterials } from "@/lib/repositories/course-material-repository";
import { getStudentGradebook } from "@/lib/repositories/gradebook-repository";
import { listReportSnapshotsForStudent } from "@/lib/repositories/report-repository";
import { listProgressNotesForStudent } from "@/lib/repositories/student-progress-repository";
import { listStudentSchedule } from "@/lib/repositories/student-schedule-repository";
import { listAssignmentsForStudent } from "@/lib/repositories/submission-repository";

const QUICK_LINKS = [
  { href: "/portal/student/schedule", label: "Open schedule" },
  { href: "/portal/student/assignments", label: "Open assignments" },
  { href: "/portal/student/materials", label: "Open materials" },
  { href: "/portal/student/attendance", label: "Open attendance" },
  { href: "/portal/student/progress", label: "Open progress" },
  { href: "/portal/student/gradebook", label: "Open gradebook" },
  { href: "/portal/student/reports", label: "Open reports" },
  { href: "/portal/student/profile", label: "Open profile" },
] as const;

type DashboardDate = Date | string | null | undefined;

function toDate(value: DashboardDate) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function statusText(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isArchivedAssignment(assignment: { archivedAt?: DashboardDate; status?: unknown }) {
  return Boolean(assignment.archivedAt) || statusText(assignment.status) === "archived";
}

function isGradedAssignment(assignment: { status?: unknown; grade?: unknown }) {
  return statusText(assignment.status) === "graded" || typeof assignment.grade === "number";
}

function isPendingAssignment(assignment: {
  archivedAt?: DashboardDate;
  dueDate?: DashboardDate;
  grade?: unknown;
  status?: unknown;
}) {
  return !isArchivedAssignment(assignment) && !isGradedAssignment(assignment);
}

function isMissingAssignment(assignment: {
  archivedAt?: DashboardDate;
  grade?: unknown;
  status?: unknown;
}) {
  return (
    !isArchivedAssignment(assignment) &&
    !isGradedAssignment(assignment) &&
    statusText(assignment.status) === "missing"
  );
}

function readCount(summary: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = summary?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function mapScheduleSummary(lessons: Awaited<ReturnType<typeof listStudentSchedule>>) {
  const now = new Date();
  const upcoming = lessons.filter((lesson) => {
    const startAt = toDate(lesson.startAt);
    return startAt ? startAt >= now : true;
  });
  const nextLesson = upcoming[0] ?? lessons[0] ?? null;

  return {
    nextLesson: nextLesson
      ? {
          href: `/portal/student/schedule/${nextLesson.id}`,
          startAt: nextLesson.startAt,
          subjectName: nextLesson.subject?.name ?? null,
          title: nextLesson.title,
        }
      : null,
    todayCount: lessons.filter((lesson) => {
      const startAt = toDate(lesson.startAt);
      if (!startAt) return false;
      return startAt.toDateString() === now.toDateString();
    }).length,
    upcomingCount: lessons.length,
  };
}

function mapAssignmentsSummary(assignments: Awaited<ReturnType<typeof listAssignmentsForStudent>>) {
  const pending = assignments.filter(isPendingAssignment).sort((left, right) => {
    const leftDate = toDate(left.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDate = toDate(right.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftDate - rightDate || left.title.localeCompare(right.title);
  });
  const overdue = assignments.filter(isMissingAssignment).sort((left, right) => {
    const leftDate = toDate(left.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDate = toDate(right.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftDate - rightDate || left.title.localeCompare(right.title);
  });

  const latestGraded = assignments.find(
    (assignment) => !isArchivedAssignment(assignment) && isGradedAssignment(assignment),
  );

  return {
    latestGraded: latestGraded
      ? {
          title: latestGraded.title,
        }
      : null,
    nextOverdue: overdue[0]
      ? {
          dueDate: overdue[0].dueDate,
          href: overdue[0].detailHref,
          title: overdue[0].title,
        }
      : null,
    nextPending: pending[0]
      ? {
          dueDate: pending[0].dueDate,
          href: pending[0].detailHref,
          title: pending[0].title,
        }
      : null,
    overdueCount: overdue.length,
    pendingCount: pending.length,
    recentGradedCount: assignments.filter(
      (assignment) => !isArchivedAssignment(assignment) && isGradedAssignment(assignment),
    ).length,
  };
}

function mapMaterialsSummary(materials: Awaited<ReturnType<typeof listStudentCourseMaterials>>) {
  const latestMaterial = materials[0] ?? null;
  return {
    latestMaterial: latestMaterial
      ? {
          href: latestMaterial.scheduledClass?.id
            ? `/portal/student/materials?scheduledClassId=${encodeURIComponent(
                latestMaterial.scheduledClass.id,
              )}`
            : "/portal/student/materials",
          title: latestMaterial.title,
        }
      : null,
    totalCount: materials.length,
  };
}

function mapAttendanceSummary(attendance: Awaited<ReturnType<typeof listStudentAttendance>>) {
  const summary = attendance.summary as Record<string, unknown>;
  const presentCount = readCount(summary, ["presentCount", "present"]);
  const lateCount = readCount(summary, ["lateCount", "late"]);
  const absentCount = readCount(summary, ["absentCount", "absent"]);
  const totalCount = readCount(summary, ["totalCount", "total"]) || attendance.records.length;
  const sourceRate = summary.attendanceRate;
  const attendanceRate =
    typeof sourceRate === "number" && Number.isFinite(sourceRate)
      ? sourceRate
      : totalCount > 0
        ? roundOne(((presentCount + lateCount) / totalCount) * 100)
        : null;

  return {
    absentCount,
    attendanceRate,
    lateCount,
    presentCount,
    totalCount,
  };
}

function mapProgressSummary(notes: Awaited<ReturnType<typeof listProgressNotesForStudent>>) {
  const latestNote = notes[0] ?? null;
  return {
    latestNote: latestNote
      ? {
          content: latestNote.content || latestNote.teacherNotes,
          recordedAt: latestNote.recordedAt,
          subjectName: latestNote.subject?.name ?? null,
        }
      : null,
  };
}

function mapGradebookSummary(gradebook: Awaited<ReturnType<typeof getStudentGradebook>>) {
  return {
    currentTermAverage: gradebook?.termAverage ?? null,
    termName: gradebook?.term?.name ?? null,
  };
}

function mapReportsSummary(reports: Awaited<ReturnType<typeof listReportSnapshotsForStudent>>) {
  const latestReport = reports[0] ?? null;
  return {
    latestReport: latestReport
      ? {
          generatedAt: latestReport.generatedAt,
          href: latestReport.href,
          termName:
            latestReport.academicTerm?.name ?? latestReport.academicTermName ?? "Academic term",
          weightedTermAverage:
            typeof latestReport.weightedTermAverage === "number"
              ? latestReport.weightedTermAverage
              : null,
        }
      : null,
  };
}

export async function getStudentDashboardData(studentId: string) {
  const now = new Date();
  const scheduleTo = addDays(now, 30);

  const [lessons, assignments, materials, attendance, progressNotes, gradebook, reports] =
    await Promise.all([
      listStudentSchedule({ from: now, studentId, to: scheduleTo }),
      listAssignmentsForStudent(studentId, { status: "all" }),
      listStudentCourseMaterials(studentId, { sort: "createdAtDesc" }),
      listStudentAttendance(studentId, {}),
      listProgressNotesForStudent(studentId, { status: "active" }),
      getStudentGradebook(studentId, ""),
      listReportSnapshotsForStudent(studentId, { sort: "generatedAtDesc" }),
    ]);

  const gradebookStudent = gradebook?.student;

  return {
    assignmentsSummary: mapAssignmentsSummary(assignments),
    attendanceSummary: mapAttendanceSummary(attendance),
    gradebookSummary: mapGradebookSummary(gradebook),
    materialsSummary: mapMaterialsSummary(materials),
    progressSummary: mapProgressSummary(progressNotes),
    quickLinks: [...QUICK_LINKS],
    reportsSummary: mapReportsSummary(reports),
    scheduleSummary: mapScheduleSummary(lessons),
    profileSummary: {
      email: gradebookStudent?.email ?? null,
      fullName: gradebookStudent?.fullName ?? null,
      href: "/portal/student/profile",
      membershipLabel: null,
    },
    student: {
      email: gradebookStudent?.email ?? null,
      fullName: gradebookStudent?.fullName ?? null,
      id: gradebookStudent?.id ?? studentId,
    },
  };
}
