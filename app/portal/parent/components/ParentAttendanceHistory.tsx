import Link from "next/link";

import type { listAttendanceForParentChild } from "@/lib/repositories/parent-attendance-repository";

type ParentAttendanceResult = Awaited<ReturnType<typeof listAttendanceForParentChild>>;
type ParentAttendanceRecord = ParentAttendanceResult["records"][number];

type ParentAttendanceHistoryProps = {
  attendance: ParentAttendanceResult;
  emptyMessage?: string;
  studentId: string;
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function subjectName(record: ParentAttendanceRecord) {
  return record.subject?.name ?? "General";
}

function classGroupName(record: ParentAttendanceRecord) {
  return record.classGroup?.name ?? "No class group";
}

export default function ParentAttendanceHistory({
  attendance,
  emptyMessage = "No attendance records yet.",
}: ParentAttendanceHistoryProps) {
  return (
    <div className="space-y-6">
      <section aria-label="Attendance summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <p className="rounded-md border p-3">Present {attendance.summary.present}</p>
        <p className="rounded-md border p-3">Late {attendance.summary.late}</p>
        <p className="rounded-md border p-3">Absent {attendance.summary.absent}</p>
        <p className="rounded-md border p-3">Total {attendance.summary.total}</p>
        {attendance.summary.attendanceRate !== null ? (
          <p className="rounded-md border p-3">
            Attendance rate {attendance.summary.attendanceRate}%
          </p>
        ) : (
          <p className="rounded-md border p-3">Attendance rate Not available</p>
        )}
      </section>

      {attendance.records.length === 0 ? (
        <output>{emptyMessage}</output>
      ) : (
        <div className="space-y-4">
          {attendance.records.map((record) => (
            <article
              aria-label={record.lesson.title}
              className="space-y-3 rounded-md border p-4"
              key={record.id}
            >
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">{record.lesson.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    Lesson date: {formatDateTime(record.lesson.startAt)}
                  </p>
                </div>
              </header>

              <div className="grid gap-1 text-sm">
                <p>
                  Subject: {subjectName(record)}; Group: {classGroupName(record)}
                </p>
                <p>
                  Status: {record.statusLabel}
                  {record.lateMinutes ? `; Late minutes: ${record.lateMinutes}` : ""}
                </p>
                {record.reason ? <p>Reason: {record.reason}</p> : null}
                <p>Marked: {formatDate(record.markedAt)}</p>
              </div>

              <Link className="text-sm font-medium underline" href={record.lesson.detailHref}>
                View lesson
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
