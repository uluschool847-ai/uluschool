import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { submitHomeworkAction } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireRole } from "@/lib/auth/session";
import { getStudentProgress, listStudentHomework } from "@/lib/repositories/portal-repository";

export const metadata: Metadata = {
  title: "Student Portal - mathSchool",
};

function formatDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).formatToParts(date);

  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";

  return `${day} ${month} ${year}`;
}

export default async function StudentPortalDashboard() {
  const session = await requireRole([UserRole.STUDENT]);

  const homeworkList = await listStudentHomework(session.uid);
  let progressList: Awaited<ReturnType<typeof getStudentProgress>> = [];

  try {
    progressList = (await getStudentProgress(session.uid)) ?? [];
  } catch (error) {
    console.error("Failed to load student progress:", error);
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back, {session.email}. View your assignments and progress here.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-heading text-xl font-semibold">My Assignments</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {homeworkList.length === 0 ? (
              <output>
                <p className="text-sm text-muted-foreground">No homework assigned yet.</p>
              </output>
            ) : (
              homeworkList.map((hw) => {
                const submission = hw.submissions[0];
                return (
                  <div key={hw.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex justify-between">
                      <h3 className="font-semibold">{hw.title}</h3>
                      <span className="text-xs text-muted-foreground">
                        Due: {formatDate(hw.dueDate)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{hw.description}</p>
                    <p className="text-xs font-medium text-primary">
                      Class: {hw.scheduledClass.title}
                    </p>

                    {submission ? (
                      <div className="bg-muted p-3 rounded-md text-sm">
                        <p>
                          <strong>Status:</strong> Submitted on {formatDate(submission.submittedAt)}
                        </p>
                        {submission.grade && (
                          <div className="mt-2 text-green-700">
                            <p>
                              <strong>Grade:</strong> {submission.grade}
                            </p>
                            <p>
                              <strong>Feedback:</strong> {submission.feedback}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <form
                        action={async (formData) => {
                          await submitHomeworkAction(formData);
                        }}
                        className="flex items-center gap-2 mt-2"
                      >
                        <input type="hidden" name="homeworkId" value={hw.id} />
                        <Input
                          name="contentUrl"
                          placeholder="Paste Google Drive/Dropbox link here"
                          required
                          className="flex-1 text-sm h-9"
                        />
                        <Button type="submit" size="sm">
                          Submit
                        </Button>
                      </form>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-heading text-xl font-semibold">My Progress</h2>
          </CardHeader>
          <CardContent>
            {progressList.length === 0 ? (
              <output>
                <p className="text-sm text-muted-foreground">No progress reports available yet.</p>
              </output>
            ) : (
              <ul className="space-y-4">
                {progressList.map((progress) => (
                  <li key={progress.id} className="rounded-lg border p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">{progress.subject.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Level: {progress.gradeLevel}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">"{progress.teacherNotes}"</p>
                    <p className="text-xs text-muted-foreground mt-2 text-right">
                      Recorded on {formatDate(progress.recordedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
