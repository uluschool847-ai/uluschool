import { generateRuleBasedAutomationTasks } from "@/lib/repositories/automation-repository";
import { sweepExpiredPendingUploads } from "@/lib/repositories/pending-upload-repository";
import { createStorageService } from "@/lib/storage";
import { NextResponse } from "next/server";

function isAuthorized(authHeader: string | null) {
  const token = process.env.CRON_SECRET ?? "";
  if (!token) return false;
  if (!authHeader) return false;
  return authHeader === `Bearer ${token}`;
}

// This endpoint is always token-protected, including local development.
export async function GET(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const storage = createStorageService();
    const [tasks, sweep] = await Promise.all([
      generateRuleBasedAutomationTasks(),
      sweepExpiredPendingUploads({ storage }),
    ]);
    if (sweep.durabilityFailures > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Storage cleanup could not preserve retry state.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({
      success: true,
      tasksCreated: tasks.length,
      message: `Generated ${tasks.length} manager tasks from rule-based automation.`,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Cron Automation Error:", error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
