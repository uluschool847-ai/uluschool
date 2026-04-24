import { NextResponse } from "next/server";

import { sendOpsAlert } from "@/lib/monitoring/alerts";
import { processDueReminders } from "@/lib/services/reminders";

function isAuthorized(authHeader: string | null) {
  const token = process.env.REMINDER_CRON_TOKEN;
  if (!token) return false;
  if (!authHeader) return false;
  return authHeader === `Bearer ${token}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Reminder processing failed", error);
    await sendOpsAlert({
      title: "Reminder Job Failed",
      message: "Scheduled reminder processing failed.",
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "Reminder processing failed" }, { status: 500 });
  }
}
