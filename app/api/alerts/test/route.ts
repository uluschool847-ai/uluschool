import { NextResponse } from "next/server";
import { z } from "zod";

import { sendOpsAlert } from "@/lib/monitoring/alerts";

function isAuthorized(authHeader: string | null) {
  const token = process.env.ALERT_TEST_TOKEN;
  if (!token) return false;
  if (!authHeader) return false;
  return authHeader === `Bearer ${token}`;
}

const alertSchema = z.object({
  message: z.string().min(1, "Message is required"),
  severity: z.enum(["info", "warning", "critical"]),
});

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = alertSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const alert = await sendOpsAlert({
    title: "Manual Alert Test",
    message: parsed.data.message,
    severity: parsed.data.severity,
  });

  return NextResponse.json({ ok: true, alert });
}
