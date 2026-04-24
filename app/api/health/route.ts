import { NextResponse } from "next/server";

import { sendOpsAlert } from "@/lib/monitoring/alerts";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "ok",
    });
  } catch (error) {
    console.error("Health check failed", error);
    await sendOpsAlert({
      title: "Health Check Failed",
      message: "Database health endpoint returned an error.",
      severity: "critical",
    });
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        database: "error",
      },
      { status: 500 },
    );
  }
}
