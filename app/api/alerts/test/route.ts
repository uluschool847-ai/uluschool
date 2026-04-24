import { NextResponse } from "next/server";

import { sendOpsAlert } from "@/lib/monitoring/alerts";

function isAuthorized(authHeader: string | null) {
  const token = process.env.ALERT_TEST_TOKEN;
  if (!token) return false;
  if (!authHeader) return false;
  return authHeader === `Bearer ${token}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const alert = await sendOpsAlert({
    title: "Manual Alert Test",
    message: "Alert pipeline test from /api/alerts/test",
    severity: "info",
  });

  return NextResponse.json({ ok: true, alert });
}
