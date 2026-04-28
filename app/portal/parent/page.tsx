import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getStudentProgress } from "@/lib/repositories/portal-repository";

export const metadata: Metadata = {
  title: "Parent Portal - mathSchool",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default async function ParentPortalDashboard() {
  const session = await requireRole([UserRole.PARENT]);

  // Note: In a full system, Parents would be linked to specific Student IDs.
  // For this implementation, we are assuming the parent is tracking progress via an array of linked student IDs.
  // Here we use a placeholder lookup.
  const progressList = await getStudentProgress(session.uid);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Parent Portal</h1>
        <p className="text-muted-foreground mt-2">
          Track your child's academic progress and teacher feedback.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Academic Progress Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {progressList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No progress reports available yet.</p>
          ) : (
            <div className="space-y-4">
              {progressList.map((progress) => (
                <div key={progress.id} className="rounded-lg border p-4 bg-muted/30">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">{progress.subject.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Level: {progress.gradeLevel}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground italic">"{progress.teacherNotes}"</p>
                  <p className="text-xs text-muted-foreground mt-3 text-right">
                    Report issued: {formatDate(progress.recordedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
