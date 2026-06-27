import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth/session";
import { listTeacherActivityLog } from "@/lib/repositories/teacher-activity-log-repository";

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const supportedActionOptions = [
  "ATTENDANCE_MARKED",
  "ATTENDANCE_UPDATED",
  "MANUAL_GRADE_CREATED",
  "MANUAL_GRADE_UPDATED",
  "MANUAL_GRADE_ARCHIVED",
] as const;

async function resolveSearchParams(searchParams: PageProps["searchParams"]) {
  return (await searchParams) ?? {};
}

function pickActivityFilters(params: Record<string, string | undefined>) {
  return {
    action: params.action,
    classGroupId: params.classGroupId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    studentId: params.studentId,
  };
}

function hasFilters(filters: ReturnType<typeof pickActivityFilters>) {
  return Object.values(filters).some(Boolean);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(value);
}

export default async function TeacherActivityPage({ searchParams }: PageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const params = await resolveSearchParams(searchParams);
  const filters = pickActivityFilters(params);
  const activity = await listTeacherActivityLog(session.uid, filters);

  return (
    <main>
      <h1>Activity Log</h1>

      <form aria-label="Activity filters">
        <label htmlFor="action">Action type</label>
        <select id="action" name="action" defaultValue={filters.action ?? ""}>
          <option value="">All activity</option>
          {supportedActionOptions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>

        <label htmlFor="studentId">Student</label>
        <input id="studentId" name="studentId" defaultValue={filters.studentId ?? ""} />

        <label htmlFor="classGroupId">Class/group</label>
        <input id="classGroupId" name="classGroupId" defaultValue={filters.classGroupId ?? ""} />

        <label htmlFor="dateFrom">Date from</label>
        <input id="dateFrom" name="dateFrom" type="date" defaultValue={filters.dateFrom ?? ""} />

        <label htmlFor="dateTo">Date to</label>
        <input id="dateTo" name="dateTo" type="date" defaultValue={filters.dateTo ?? ""} />

        <button type="submit">Apply filters</button>
      </form>

      {activity.length === 0 ? (
        <p>
          {hasFilters(filters) ? "No activity matches the selected filters." : "No activity yet."}
        </p>
      ) : (
        <ul>
          {activity.map((item) => (
            <li key={item.id}>
              <h2>{item.label}</h2>
              {item.studentName ? <p>{item.studentName}</p> : null}
              {item.classGroupName ? <p>{item.classGroupName}</p> : null}
              {item.lessonTitle ? <p>{item.lessonTitle}</p> : null}
              {item.summary ? <p>{item.summary}</p> : null}
              {item.reason ? <p>{item.reason}</p> : null}
              <time dateTime={item.createdAt.toISOString()}>{formatDate(item.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
