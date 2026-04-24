import { NextResponse } from "next/server";
import { generateTasksForStaleEnquiries } from "@/lib/repositories/automation-repository";

// To protect this endpoint, we check for a specific Authorization Bearer token 
// that matches a secret environment variable known only to our Cron provider (e.g., Vercel Cron).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  
  // In production, enforce CRON_SECRET checking
  if (process.env.NODE_ENV === "production") {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const tasks = await generateTasksForStaleEnquiries();
    return NextResponse.json({
      success: true,
      tasksCreated: tasks.length,
      message: `Generated ${tasks.length} manager tasks for stale enquiries.`,
    });
  } catch (error: any) {
    console.error("Cron Automation Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
