import Link from "next/link";

import {
  TeacherStartLessonButton,
  normalizeTeacherStartLessonProvider,
} from "@/components/portal/teacher-start-lesson-button";
import {
  LESSON_STATUS_LABELS,
  deriveLessonRuntimeStatus,
  parseLessonStatus,
} from "@/lib/lessons/lesson-status";
import type {
  StartState,
  TeacherScheduleFilterOptions,
  TeacherScheduleLesson,
} from "@/lib/repositories/teacher-schedule-repository";
import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  localDateTimeToUtc,
  utcToLocalDateTime,
} from "@/lib/scheduling/availability";

export const TEACHER_LESSON_STATUSES = [
  "SCHEDULED",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
  "RESCHEDULED",
] as const;

export function getDateRange(fromValue?: string, toValue?: string) {
  const defaults = getDefaultDateRange();
  const selectedFromValue = getValidDateInput(fromValue) ?? defaults.fromValue;
  const selectedToValue = getValidDateInput(toValue) ?? defaults.toValue;
  const from = parseDateStart(selectedFromValue);
  const to = parseDateEnd(selectedToValue);
  if (!from || !to) throw new Error("Validated schedule date range could not be parsed.");
  const messages: string[] = [];

  if (from.getTime() > to.getTime()) {
    messages.push("Date range was reset to the current month.");
    return {
      from: defaults.from,
      to: defaults.to,
      fromValue: defaults.fromValue,
      toValue: defaults.toValue,
      messages,
    };
  }

  const maxToValue = addCalendarMonths(selectedFromValue, 6);
  const maxTo = parseDateEnd(maxToValue);
  if (!maxTo) throw new Error("Validated schedule maximum date could not be parsed.");
  const boundedTo = to.getTime() > maxTo.getTime() ? maxTo : to;
  const boundedToValue = to.getTime() > maxTo.getTime() ? maxToValue : selectedToValue;
  if (boundedToValue !== selectedToValue) {
    messages.push("Date range was limited. Maximum range is 6 months.");
  }

  return {
    from,
    to: boundedTo,
    fromValue: selectedFromValue,
    toValue: boundedToValue,
    messages,
  };
}

function getDefaultDateRange() {
  const todayValue = getNairobiDateInput();
  const today = getDateParts(todayValue);
  const fromValue = formatCalendarDate(new Date(Date.UTC(today.year, today.monthIndex, 1)));
  const toValue = formatCalendarDate(new Date(Date.UTC(today.year, today.monthIndex + 1, 0)));
  const from = parseDateStart(fromValue);
  const to = parseDateEnd(toValue);
  if (!from || !to) throw new Error("Default schedule date range could not be parsed.");

  return {
    from,
    to,
    fromValue,
    toValue,
  };
}

function parseDateStart(value?: string) {
  const parts = parseDateParts(value);
  return parts
    ? localDateTimeToUtc({
        value: `${value}T00:00:00`,
        timezone: DEFAULT_AVAILABILITY_TIMEZONE,
      })
    : null;
}

function parseDateEnd(value?: string) {
  const parts = parseDateParts(value);
  if (!parts) return null;
  const end = localDateTimeToUtc({
    value: `${value}T23:59:59`,
    timezone: DEFAULT_AVAILABILITY_TIMEZONE,
  });
  return new Date(end.getTime() + 999);
}

function parseDateParts(value?: string) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1,
    day: Number(match[3]),
  };
  const date = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day));
  return date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.monthIndex &&
    date.getUTCDate() === parts.day
    ? parts
    : null;
}

function getValidDateInput(value?: string) {
  return parseDateParts(value) ? (value ?? null) : null;
}

function getDateParts(value: string) {
  const parts = parseDateParts(value);
  if (!parts) throw new Error("Validated schedule date could not be parsed.");
  return parts;
}

function getNairobiDateInput(date = new Date()) {
  return utcToLocalDateTime({
    date,
    timezone: DEFAULT_AVAILABILITY_TIMEZONE,
  }).slice(0, 10);
}

function addCalendarMonths(value: string, months: number) {
  const parts = getDateParts(value);
  return formatCalendarDate(new Date(Date.UTC(parts.year, parts.monthIndex + months, parts.day)));
}

function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatCalendarDate(date);
}

function formatCalendarDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lessonStatusLabel(value: string) {
  const status = parseLessonStatus(value);
  return status ? LESSON_STATUS_LABELS[status] : value;
}

function formatDateTimeRange(lesson: Pick<TeacherScheduleLesson, "startAt" | "endAt">) {
  return `${formatNairobiDate(lesson.startAt)} ${formatTime(lesson.startAt)} - ${formatTime(
    lesson.endAt,
  )}`;
}

export function formatNairobiDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DEFAULT_AVAILABILITY_TIMEZONE,
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_AVAILABILITY_TIMEZONE,
  }).format(date);
}

export function TeacherScheduleFilters(props: {
  from: string;
  to: string;
  classGroupId?: string;
  subjectId?: string;
  status?: string;
  options: TeacherScheduleFilterOptions;
  messages?: string[];
}) {
  const ranges = getQuickRanges();

  return (
    <section className="space-y-3" aria-label="Schedule filters">
      {props.messages?.length ? (
        <div className="rounded-md border p-3 text-sm">
          {props.messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1 text-sm font-medium">
          <label htmlFor="teacher-schedule-from">From</label>
          <input
            id="teacher-schedule-from"
            name="from"
            type="date"
            defaultValue={props.from}
            className="h-10 rounded-md border px-3"
          />
        </div>

        <div className="grid gap-1 text-sm font-medium">
          <label htmlFor="teacher-schedule-to">To</label>
          <input
            id="teacher-schedule-to"
            name="to"
            type="date"
            defaultValue={props.to}
            className="h-10 rounded-md border px-3"
          />
        </div>

        <div className="grid gap-1 text-sm font-medium">
          <label htmlFor="teacher-schedule-class-group">Class group</label>
          <select
            id="teacher-schedule-class-group"
            name="classGroupId"
            defaultValue={props.classGroupId ?? ""}
            className="h-10 rounded-md border px-3"
          >
            <option value="">All class groups</option>
            {props.options.classGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1 text-sm font-medium">
          <label htmlFor="teacher-schedule-subject">Subject</label>
          <select
            id="teacher-schedule-subject"
            name="subjectId"
            defaultValue={props.subjectId ?? ""}
            className="h-10 rounded-md border px-3"
          >
            <option value="">All subjects</option>
            {props.options.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1 text-sm font-medium">
          <label htmlFor="teacher-schedule-status">Status</label>
          <select
            id="teacher-schedule-status"
            name="status"
            defaultValue={props.status ?? ""}
            className="h-10 rounded-md border px-3"
          >
            <option value="">All statuses</option>
            {TEACHER_LESSON_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LESSON_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="h-10 rounded-md border px-4 font-medium">
          Apply
        </button>
        <Link href="/portal/teacher/schedule" className="h-10 rounded-md border px-4 py-2 text-sm">
          Reset filters
        </Link>
      </form>

      <nav aria-label="Quick ranges" className="flex flex-wrap gap-2 text-sm">
        {ranges.map((range) => (
          <Link key={range.label} href={range.href} className="rounded-md border px-3 py-2">
            {range.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}

export function ActiveFilterSummary(props: {
  from: string;
  to: string;
  classGroupId?: string;
  subjectId?: string;
  status?: string;
  options: TeacherScheduleFilterOptions;
}) {
  const group = props.options.classGroups.find((option) => option.id === props.classGroupId);
  const subject = props.options.subjects.find((option) => option.id === props.subjectId);

  return (
    <aside className="rounded-md border p-3 text-sm" aria-label="Active filters">
      <p>Active filters</p>
      <p>
        Date range: {props.from} to {props.to}
      </p>
      {group ? <p>Class group: {group.name}</p> : null}
      {subject ? <p>Subject: {subject.name}</p> : null}
      {props.status ? <p>Status: {lessonStatusLabel(props.status)}</p> : null}
      <Link href="/portal/teacher/schedule">Clear</Link>
    </aside>
  );
}

function getQuickRanges() {
  const todayValue = getNairobiDateInput();
  const today = getDateParts(todayValue);
  const dayOfWeek = new Date(Date.UTC(today.year, today.monthIndex, today.day)).getUTCDay();
  const weekStartValue = addCalendarDays(todayValue, -((dayOfWeek + 6) % 7));
  const weekEndValue = addCalendarDays(weekStartValue, 6);
  const monthStartValue = formatCalendarDate(new Date(Date.UTC(today.year, today.monthIndex, 1)));
  const monthEndValue = formatCalendarDate(new Date(Date.UTC(today.year, today.monthIndex + 1, 0)));
  const nextSevenEndValue = addCalendarDays(todayValue, 6);

  return [
    { label: "Today", href: quickRangeHref(todayValue, todayValue) },
    { label: "This Week", href: quickRangeHref(weekStartValue, weekEndValue) },
    { label: "This Month", href: quickRangeHref(monthStartValue, monthEndValue) },
    { label: "Next 7 Days", href: quickRangeHref(todayValue, nextSevenEndValue) },
  ];
}

function quickRangeHref(from: string, to: string) {
  return `/portal/teacher/schedule?from=${from}&to=${to}`;
}

export function TeacherLessonCard(props: {
  lesson: TeacherScheduleLesson;
  startState: StartState;
  detailHref: string;
}) {
  const { lesson } = props;
  const runtime = deriveLessonRuntimeStatus(lesson, new Date());

  return (
    <article className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{lesson.title}</p>
          {lesson.description ? (
            <p className="text-sm text-muted-foreground">{lesson.description}</p>
          ) : null}
        </div>
        <span className="rounded-md border px-2 py-1 text-sm">
          {lessonStatusLabel(String(runtime.displayStatus))}
        </span>
      </header>

      <TeacherLessonFacts lesson={lesson} />

      <div className="flex flex-wrap items-center gap-3">
        <Link href={props.detailHref} className="rounded-md border px-3 py-2 text-sm font-medium">
          Lesson details
        </Link>
        <TeacherStartLessonButton
          provider={normalizeTeacherStartLessonProvider(lesson.meetingProvider)}
          startState={props.startState}
        />
      </div>
    </article>
  );
}

export function TeacherLessonDetail(props: {
  lesson: TeacherScheduleLesson;
  startState: StartState;
}) {
  const { lesson } = props;
  const runtime = deriveLessonRuntimeStatus(lesson, new Date());

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{lesson.title}</h1>
        {lesson.description ? <p>{lesson.description}</p> : null}
        <p>Status: {lessonStatusLabel(String(runtime.displayStatus))}</p>
        {lesson.cancelReason ? <p>Cancel reason: {lesson.cancelReason}</p> : null}
        {lesson.rescheduledFromId ? <p>Rescheduled from {lesson.rescheduledFromId}</p> : null}
      </header>

      <section className="space-y-3 rounded-lg border p-4" aria-label="Lesson information">
        <h2 className="text-xl font-semibold">Lesson info</h2>
        <TeacherLessonFacts lesson={lesson} compact />
        <TeacherStartLessonButton
          provider={normalizeTeacherStartLessonProvider(lesson.meetingProvider)}
          startState={props.startState}
        />
      </section>

      <section className="space-y-2 rounded-lg border p-4" aria-label="Roster">
        <h2 className="text-xl font-semibold">Roster</h2>
        {lesson.rosterPreview.length === 0 ? (
          <p>No students enrolled.</p>
        ) : (
          <ul className="space-y-1">
            {lesson.rosterPreview.map((student) => (
              <li key={student.id}>
                {student.fullName}
                {!student.isActive ? " (inactive)" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-lg border p-4" aria-label="Materials">
        <h2 className="text-xl font-semibold">Materials</h2>
        {lesson.materials.length === 0 ? (
          <p>No materials yet.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {lesson.materials.map((material) => (
              <li key={material.id}>{material.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-lg border p-4" aria-label="Assignments">
        <h2 className="text-xl font-semibold">Homework</h2>
        {lesson.assignments.length === 0 ? (
          <p>No homework assigned.</p>
        ) : (
          <ul className="space-y-3">
            {lesson.assignments.map((assignment) => (
              <li key={assignment.id} className="rounded-md border p-3">
                <p className="font-medium">{assignment.title}</p>
                <p>Due: {formatNairobiDate(assignment.dueDate)}</p>
                <p>Submissions: {assignment.submissionCount}</p>
                <p>Pending submissions: {assignment.pendingSubmissionCount}</p>
              </li>
            ))}
          </ul>
        )}
        <p>{lesson.submissionsSummary.total} submissions</p>
        <p>{lesson.submissionsSummary.pending} pending</p>
      </section>

      <Link
        href={lesson.progressHref ?? `/portal/teacher/progress?lessonId=${lesson.id}`}
        className="rounded-md border px-3 py-2 text-sm font-medium"
      >
        Progress notes
      </Link>
    </main>
  );
}

function TeacherLessonFacts({
  lesson,
  compact = false,
}: {
  lesson: TeacherScheduleLesson;
  compact?: boolean;
}) {
  const runtime = deriveLessonRuntimeStatus(lesson, new Date());

  return (
    <div className="grid gap-1 text-sm">
      <p>Subject: {lesson.subject?.name ?? "General"}</p>
      <p>Class group: {lesson.classGroup?.name ?? "No class group"}</p>
      <p>Date/time: {formatDateTimeRange(lesson)}</p>
      <p>Timezone: {lesson.timezone}</p>
      <p>Students: {lesson.studentCount}</p>
      {!compact && lesson.rosterPreview.length > 0 ? (
        <p>
          Roster:{" "}
          {lesson.rosterPreview
            .map((student) => `${student.fullName}${student.isActive ? "" : " (inactive)"}`)
            .join(", ")}
        </p>
      ) : null}
      <p>Materials: {lesson.materialsCount}</p>
      <p>Assignments: {lesson.assignmentsCount}</p>
      <p>Homework: {lesson.assignmentsCount}</p>
      <p>Pending submissions: {lesson.pendingSubmissionsCount}</p>
      {!compact && lesson.cancelReason ? <p>Cancel reason: {lesson.cancelReason}</p> : null}
      {!compact && lesson.rescheduledFromId ? (
        <p>Rescheduled from {lesson.rescheduledFromId}</p>
      ) : null}
      {!compact ? <p>Status: {lessonStatusLabel(String(runtime.displayStatus))}</p> : null}
    </div>
  );
}
