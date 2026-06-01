import { listParentChildAttendance } from "@/lib/repositories/attendance-repository";
import { listParentChildCourseMaterials } from "@/lib/repositories/course-material-repository";
import { getParentChildGradebook } from "@/lib/repositories/gradebook-repository";
import { getLinkedChildren } from "@/lib/repositories/portal-repository";
import { listReportSnapshotsForParentChild } from "@/lib/repositories/report-repository";
import { listProgressNotesForParentChild } from "@/lib/repositories/student-progress-repository";
import { listParentChildSchedule } from "@/lib/repositories/student-schedule-repository";
import { listAssignmentsForStudent } from "@/lib/repositories/submission-repository";

type DashboardDate = Date | string | null | undefined;

type LinkedChild = Awaited<ReturnType<typeof getLinkedChildren>>[number];
type ChildSchedule = Awaited<ReturnType<typeof listParentChildSchedule>>;
type ChildAssignments = Awaited<ReturnType<typeof listAssignmentsForStudent>>;
type ChildMaterials = Awaited<ReturnType<typeof listParentChildCourseMaterials>>;
type ChildAttendance = Awaited<ReturnType<typeof listParentChildAttendance>>;
type ChildProgress = Awaited<ReturnType<typeof listProgressNotesForParentChild>>;
type ChildGradebook = Awaited<ReturnType<typeof getParentChildGradebook>>;
type ChildReports = Awaited<ReturnType<typeof listReportSnapshotsForParentChild>>;

const DASHBOARD_DAYS = 30;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDate(value: DashboardDate) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function isGradedAssignment(assignment: { grade?: unknown; status?: unknown }) {
  return statusText(assignment.status) === "graded" || typeof assignment.grade === "number";
}

function isPendingAssignment(assignment: {
  archivedAt?: DashboardDate;
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

function getChildName(child: LinkedChild) {
  return child.fullName;
}

function mapScheduleSummary(studentId: string, lessons: ChildSchedule) {
  const now = new Date();
  const upcoming = lessons.filter((lesson) => {
    const startAt = toDate(lesson.startAt);
    return startAt ? startAt >= now : true;
  });
  const nextLesson = upcoming[0] ?? lessons[0] ?? null;

  return {
    nextLesson: nextLesson
      ? {
          classGroupName: nextLesson.classGroup?.name ?? null,
          href: `/portal/parent/schedule/${studentId}/${nextLesson.id}`,
          startAt: nextLesson.startAt,
          subjectName: nextLesson.subject?.name ?? null,
          teacherName: nextLesson.teacher?.fullName ?? null,
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

function mapAssignmentsSummary(studentId: string, assignments: ChildAssignments) {
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
    latestGraded: latestGraded ? { title: latestGraded.title } : null,
    nextOverdue: overdue[0]
      ? {
          dueDate: overdue[0].dueDate,
          href: `/portal/parent/assignments/${studentId}`,
          title: overdue[0].title,
        }
      : null,
    nextPending: pending[0]
      ? {
          dueDate: pending[0].dueDate,
          href: `/portal/parent/assignments/${studentId}`,
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

function mapMaterialsSummary(studentId: string, materials: ChildMaterials) {
  const latestMaterial = materials[0] ?? null;

  return {
    latestMaterial: latestMaterial
      ? {
          href: `/portal/parent/materials/${studentId}`,
          title: latestMaterial.title,
        }
      : null,
    totalCount: materials.length,
  };
}

function mapAttendanceSummary(attendance: ChildAttendance) {
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

function mapProgressSummary(notes: ChildProgress) {
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

function mapGradebookSummary(gradebook: ChildGradebook) {
  return {
    currentTermAverage: gradebook?.termAverage ?? null,
    termName: gradebook?.term?.name ?? null,
  };
}

function mapReportsSummary(reports: ChildReports) {
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

function quickLinks(studentId: string) {
  return [
    {
      href: `/portal/parent/schedule?studentId=${encodeURIComponent(studentId)}`,
      label: "Open schedule",
    },
    { href: `/portal/parent/assignments/${studentId}`, label: "Open assignments" },
    { href: `/portal/parent/materials/${studentId}`, label: "Open materials" },
    { href: `/portal/parent/attendance/${studentId}`, label: "Open attendance" },
    { href: `/portal/parent/progress/${studentId}`, label: "Open progress" },
    { href: `/portal/parent/gradebook/${studentId}`, label: "Open gradebook" },
    { href: `/portal/parent/reports/${studentId}`, label: "Open reports" },
    { href: `/portal/parent/billing/${studentId}`, label: "Open billing" },
  ];
}

async function buildChildDashboard(parentId: string, child: LinkedChild, now: Date) {
  const studentId = child.id;
  const scheduleTo = addDays(now, DASHBOARD_DAYS);
  const [lessons, assignments, materials, attendance, progressNotes, gradebook, reports] =
    await Promise.all([
      listParentChildSchedule({ from: now, parentId, studentId, to: scheduleTo }),
      listAssignmentsForStudent(studentId, { status: "all" }),
      listParentChildCourseMaterials(parentId, studentId, { sort: "createdAtDesc" }),
      listParentChildAttendance(parentId, studentId, {}),
      listProgressNotesForParentChild(parentId, studentId, { status: "active" }),
      getParentChildGradebook(parentId, studentId, ""),
      listReportSnapshotsForParentChild(parentId, studentId, { sort: "generatedAtDesc" } as {
        termId?: string;
      }),
    ]);

  const childName = getChildName(child);

  return {
    assignmentsSummary: mapAssignmentsSummary(studentId, assignments),
    attendanceSummary: mapAttendanceSummary(attendance),
    childName,
    fullName: childName,
    gradebookSummary: mapGradebookSummary(gradebook),
    id: studentId,
    materialsSummary: mapMaterialsSummary(studentId, materials),
    progressSummary: mapProgressSummary(progressNotes),
    quickLinks: quickLinks(studentId),
    reportsSummary: mapReportsSummary(reports),
    scheduleSummary: mapScheduleSummary(studentId, lessons),
  };
}

export async function getParentDashboardData(parentId: string) {
  const now = new Date();
  const children = await getLinkedChildren(parentId);
  const childDashboards = await Promise.all(
    children.map((child) => buildChildDashboard(parentId, child, now)),
  );

  return { children: childDashboards };
}
