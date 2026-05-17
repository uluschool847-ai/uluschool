import { AuditLogFilters } from "@/components/admin/audit/AuditLogFilters";
import { UserRole } from "@prisma/client";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { getLogs } from "@/lib/repositories/admin-audit-repository";

type SearchParams = Record<string, string | undefined>;

type AuditPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

const PAGE_SIZE = 25;

const SENSITIVE_DISPLAY_KEY_PATTERNS = [
  "password",
  "passwordhash",
  "sessiontoken",
  "authtoken",
  "token",
  "twofactorsecret",
  "totp",
  "backupcode",
  "backupcodes",
  "smtp",
  "secret",
];

function isSensitiveDisplayKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_DISPLAY_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function sanitizeDisplayValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDisplayValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        isSensitiveDisplayKey(key) ? "[REDACTED]" : sanitizeDisplayValue(nestedValue),
      ]),
    );
  }

  return value;
}

function formatValue(value: unknown) {
  if (value === undefined) {
    return "";
  }

  if (value === null) {
    return "null";
  }

  const sanitizedValue = sanitizeDisplayValue(value);

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(sanitizedValue);
  }

  return JSON.stringify(sanitizedValue, null, 2);
}

function parsePage(value?: string) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseDateBoundary(value: string | undefined, boundary: "start" | "end") {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function pageHref(searchParams: SearchParams, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page") {
      params.set(key, value);
    }
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/admin/audit?${query}` : "/admin/audit";
}

export default async function AdminAuditPage({ searchParams = {} }: AuditPageProps) {
  await requireRole([UserRole.ADMIN]);

  const resolvedSearchParams = await searchParams;
  const actionType = resolvedSearchParams.actionType ?? resolvedSearchParams.action;
  const targetType = resolvedSearchParams.targetType ?? resolvedSearchParams.entity;
  const targetId = resolvedSearchParams.targetId;
  const adminUserId = resolvedSearchParams.adminUserId;
  const fromDate = parseDateBoundary(resolvedSearchParams.from, "start");
  const toDate = parseDateBoundary(resolvedSearchParams.to, "end");
  const page = parsePage(resolvedSearchParams.page);
  const logsWithLookahead = await getLogs({
    actionType,
    targetType,
    targetId,
    adminUserId,
    dateRange: fromDate || toDate ? { from: fromDate, to: toDate } : undefined,
    limit: PAGE_SIZE + 1,
    offset: (page - 1) * PAGE_SIZE,
  });
  const hasNextPage = logsWithLookahead.length > PAGE_SIZE;
  const logs = logsWithLookahead.slice(0, PAGE_SIZE);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-950">Audit Log</h1>
        <p className="mt-2 text-sm text-slate-600">
          Review critical admin actions and entity changes.
        </p>
      </header>

      <AuditLogFilters
        initialActionType={actionType}
        initialEntityType={targetType}
        initialAdminUserId={adminUserId}
        initialFrom={resolvedSearchParams.from}
        initialTo={resolvedSearchParams.to}
      />

      {logs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
          No audit logs found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[1100px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Target ID</th>
                <th className="px-4 py-3">Before</th>
                <th className="px-4 py-3">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const actorName =
                  log.actorFullName ||
                  log.actorEmail ||
                  log.adminUser?.fullName ||
                  log.adminUser?.email ||
                  "Deleted account";
                const actorEmail = log.actorEmail || log.adminUser?.email || "";
                const actorRole = log.actorRole ?? "";

                return (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(log.createdAt).toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">{actorName}</p>
                      <p className="text-xs text-slate-500">{actorEmail}</p>
                      {actorRole ? <p className="text-xs text-slate-500">{actorRole}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-950">{log.action}</td>
                    <td className="px-4 py-3 text-slate-700">{log.targetType}</td>
                    <td className="max-w-[14rem] px-4 py-3 text-xs text-slate-500">
                      <span className="block break-all">{log.targetId ?? ""}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <pre className="max-h-48 max-w-[22rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 text-xs leading-relaxed text-slate-700">
                        {formatValue(log.before)}
                      </pre>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <pre className="max-h-48 max-w-[22rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 text-xs leading-relaxed text-slate-700">
                        {formatValue(log.after)}
                      </pre>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <nav className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-slate-600">Page {page}</p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700"
              href={pageHref(resolvedSearchParams, page - 1)}
            >
              Previous
            </Link>
          ) : null}
          {hasNextPage ? (
            <Link
              className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700"
              href={pageHref(resolvedSearchParams, page + 1)}
            >
              Next
            </Link>
          ) : null}
        </div>
      </nav>
    </main>
  );
}
