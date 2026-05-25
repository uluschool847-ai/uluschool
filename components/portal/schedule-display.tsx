import Link from "next/link";

import {
  LESSON_STATUS_LABELS,
  deriveLessonRuntimeStatus,
  parseLessonStatus,
} from "@/lib/lessons/lesson-status";
import { MISSING_MEETING_LINK_REASON, validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";
import type {
  JoinState,
  StudentScheduleLesson,
} from "@/lib/repositories/student-schedule-repository";

export const LESSON_STATUSES = [
  "SCHEDULED",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
  "RESCHEDULED",
] as const;

export function getMonthRange(monthValue?: string) {
  const now = new Date();
  const match = monthValue?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { from, to, value: formatMonth(from) };
}

export function formatMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDateTimeRange(lesson: Pick<StudentScheduleLesson, "startAt" | "endAt">) {
  return `${formatDate(lesson.startAt)} ${formatTime(lesson.startAt)} - ${formatTime(
    lesson.endAt,
  )}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function genericLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function lessonStatusLabel(value: string) {
  const status = parseLessonStatus(value);
  return status ? LESSON_STATUS_LABELS[status] : genericLabel(value);
}

function formatSubmissionStatus(value: string) {
  return genericLabel(value);
}

function isSafeHref(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  if (trimmed.startsWith("/uploads/")) return true;

  try {
    const url = new URL(trimmed);
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      url.pathname.startsWith("/e2e-assets/")
    ) {
      return true;
    }
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function safeHref(value: string | null | undefined) {
  return isSafeHref(value) ? (value?.trim() ?? null) : null;
}

export function ScheduleFilters(props: {
  month: string;
  subjectId?: string;
  status?: string;
  childOptions?: Array<{ id: string; fullName: string }>;
  selectedChildId?: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      {props.childOptions && props.childOptions.length > 0 ? (
        <label className="grid gap-1 text-sm font-medium">
          Child
          <select
            name="studentId"
            defaultValue={props.selectedChildId}
            className="h-10 rounded-md border px-3"
          >
            {props.childOptions.map((child) => (
              <option key={child.id} value={child.id}>
                {child.fullName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="grid gap-1 text-sm font-medium">
        Month
        <input
          name="month"
          type="month"
          defaultValue={props.month}
          className="h-10 rounded-md border px-3"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Subject
        <input
          name="subjectId"
          defaultValue={props.subjectId ?? ""}
          placeholder="Subject id"
          className="h-10 rounded-md border px-3"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Status
        <select
          name="status"
          defaultValue={props.status ?? ""}
          className="h-10 rounded-md border px-3"
        >
          <option value="">All statuses</option>
          {LESSON_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LESSON_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="h-10 rounded-md border px-4 font-medium">
        Apply
      </button>
    </form>
  );
}

export function LessonCard(props: {
  lesson: StudentScheduleLesson;
  joinState: JoinState;
  detailHref: string;
  childName?: string | null;
}) {
  const { lesson } = props;
  const runtime = deriveLessonRuntimeStatus(lesson, new Date());
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{lesson.title}</p>
          {props.childName ? <p className="text-sm">Child: {props.childName}</p> : null}
        </div>
        <span className="rounded-md border px-2 py-1 text-sm">
          {lessonStatusLabel(String(runtime.displayStatus))}
        </span>
      </header>

      <div className="grid gap-1 text-sm">
        <p>Subject: {lesson.subject?.name ?? "General"}</p>
        <p>Level: {lesson.level?.name ?? "Not set"}</p>
        <p>Teacher: {lesson.teacher?.fullName ?? "TBA"}</p>
        <p>Group: {lesson.classGroup?.name ?? "No class group"}</p>
        <p>Date/time: {formatDateTimeRange(lesson)}</p>
        <p>Timezone: {lesson.timezone}</p>
        {lesson.status === "CANCELLED" && lesson.cancelReason ? (
          <p>Cancel reason: {lesson.cancelReason}</p>
        ) : null}
        {lesson.status === "RESCHEDULED" || lesson.rescheduledFromId ? (
          <p>Rescheduled from {lesson.rescheduledFromId ?? "previous lesson"}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={props.detailHref} className="rounded-md border px-3 py-2 text-sm font-medium">
          Lesson details
        </Link>
        <JoinLessonControl joinState={props.joinState} />
      </div>
    </article>
  );
}

export function LessonDetail(props: {
  lesson: StudentScheduleLesson;
  joinState: JoinState;
  childName?: string | null;
  attendanceHistoryHref?: string;
}) {
  const { lesson } = props;
  const runtime = deriveLessonRuntimeStatus(lesson, new Date());
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{lesson.title}</h1>
        {props.childName ? <p>Child: {props.childName}</p> : null}
        <p>Status: {lessonStatusLabel(String(runtime.displayStatus))}</p>
        {lesson.status === "CANCELLED" && lesson.cancelReason ? (
          <p>Cancel reason: {lesson.cancelReason}</p>
        ) : null}
      </header>

      <section className="space-y-2 rounded-lg border p-4" aria-label="Lesson information">
        <h2 className="text-xl font-semibold">Lesson info</h2>
        <p>Subject: {lesson.subject?.name ?? "General"}</p>
        <p>Level: {lesson.level?.name ?? "Not set"}</p>
        <p>Teacher: {lesson.teacher?.fullName ?? "TBA"}</p>
        <p>Group: {lesson.classGroup?.name ?? "No class group"}</p>
        <p>Date/time: {formatDateTimeRange(lesson)}</p>
        <p>Timezone: {lesson.timezone}</p>
        {lesson.rescheduledFromId ? <p>Rescheduled from {lesson.rescheduledFromId}</p> : null}
        {lesson.description ? <p>{lesson.description}</p> : null}
        <JoinLessonControl joinState={props.joinState} />
      </section>

      <section className="space-y-2 rounded-lg border p-4" aria-label="Materials">
        <h2 className="text-xl font-semibold">Materials</h2>
        <Link
          href={`/portal/student/materials?scheduledClassId=${lesson.id}`}
          className="text-sm font-medium underline"
        >
          View all materials
        </Link>
        {lesson.materials.length === 0 ? (
          <p>No materials yet.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {lesson.materials.map((material) => {
              const href = safeHref(material.safeFileUrl ?? material.url);
              return (
                <li key={material.id}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {material.title}
                    </a>
                  ) : (
                    <span>{material.title}</span>
                  )}
                  {material.attachments && material.attachments.length > 0 ? (
                    <ul className="list-disc pl-5">
                      {material.attachments.map((attachment) => {
                        const attachmentHref = safeHref(attachment.href);
                        return (
                          <li key={`${material.id}-${attachment.filename}`}>
                            {attachmentHref ? (
                              <a href={attachmentHref} target="_blank" rel="noreferrer">
                                {attachment.filename}
                              </a>
                            ) : (
                              <span>{attachment.filename}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-lg border p-4" aria-label="Homework">
        <h2 className="text-xl font-semibold">Homework</h2>
        {lesson.assignments.length === 0 ? (
          <p>No homework assigned.</p>
        ) : (
          <ul className="space-y-3">
            {lesson.assignments.map((assignment) => (
              <li key={assignment.id} className="rounded-md border p-3">
                <p className="font-medium">{assignment.title}</p>
                <p>Due: {formatDate(assignment.dueDate)}</p>
                <p>Submission: {formatSubmissionStatus(assignment.submissionStatus)}</p>
                {assignment.grade !== null ? <p>Grade: {assignment.grade}</p> : null}
                {assignment.grade !== null && assignment.feedback ? (
                  <p>Feedback: {assignment.feedback}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-lg border p-4" aria-label="Attendance">
        <h2 className="text-xl font-semibold">Attendance</h2>
        {props.attendanceHistoryHref ? (
          <Link href={props.attendanceHistoryHref} className="text-sm font-medium underline">
            View attendance history
          </Link>
        ) : null}
        {lesson.attendance ? (
          <div className="space-y-1">
            <p>Attendance: {genericLabel(lesson.attendance.status)}</p>
            {lesson.attendance.lateMinutes ? (
              <p>Late minutes: {lesson.attendance.lateMinutes}</p>
            ) : null}
            {lesson.attendance.reason ? <p>Reason: {lesson.attendance.reason}</p> : null}
            {lesson.attendance.markedAt ? (
              <p>Marked: {formatDate(lesson.attendance.markedAt)}</p>
            ) : null}
          </div>
        ) : (
          <p>Attendance has not been marked.</p>
        )}
      </section>
    </main>
  );
}

export function JoinLessonControl({ joinState }: { joinState: JoinState }) {
  if (joinState.enabled && joinState.href) {
    const validation = validateLiveLessonUrl(joinState.href, "MANUAL_URL");
    if (!validation.ok || !validation.url) {
      return (
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            disabled
            className="rounded-md border px-3 py-2 text-sm font-medium"
          >
            Join lesson
          </button>
          <span className="text-sm">{joinState.reason ?? MISSING_MEETING_LINK_REASON}</span>
        </span>
      );
    }

    return (
      <a
        href={validation.url}
        target="_blank"
        rel="noreferrer"
        className="rounded-md border px-3 py-2 text-sm font-medium"
      >
        Join lesson
      </a>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled className="rounded-md border px-3 py-2 text-sm font-medium">
        Join lesson
      </button>
      {joinState.reason ? <span className="text-sm">{joinState.reason}</span> : null}
    </span>
  );
}
