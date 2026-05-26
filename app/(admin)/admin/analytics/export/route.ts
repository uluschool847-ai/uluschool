import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth/session";
import { getAnalyticsCsvRows } from "@/lib/repositories/analytics-repository";

function parseDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  await requireRole([UserRole.ADMIN]);
  const url = new URL(request.url);
  const rows = await getAnalyticsCsvRows({
    ...(parseDate(url.searchParams.get("from"))
      ? { from: parseDate(url.searchParams.get("from")) }
      : {}),
    ...(parseDate(url.searchParams.get("to")) ? { to: parseDate(url.searchParams.get("to")) } : {}),
    ...(url.searchParams.get("levelId") ? { levelId: url.searchParams.get("levelId") ?? "" } : {}),
    ...(url.searchParams.get("planId") ? { planId: url.searchParams.get("planId") ?? "" } : {}),
    ...(url.searchParams.get("subjectId")
      ? { subjectId: url.searchParams.get("subjectId") ?? "" }
      : {}),
    ...(url.searchParams.get("teacherId")
      ? { teacherId: url.searchParams.get("teacherId") ?? "" }
      : {}),
    ...(url.searchParams.get("trafficSource")
      ? { trafficSource: url.searchParams.get("trafficSource") ?? "" }
      : {}),
  });
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Disposition": 'attachment; filename="analytics-kes-export.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
