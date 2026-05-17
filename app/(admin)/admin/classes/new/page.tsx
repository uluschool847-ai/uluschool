import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { ClassGroupForm } from "@/components/admin/classes/ClassGroupForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getLevels } from "@/lib/repositories/catalogue-repository";
import { listUsersByRole } from "@/lib/repositories/portal-repository";
import { listActiveSubjects } from "@/lib/repositories/subject-repository";

export const metadata: Metadata = {
  title: "Create Class Group",
};

export default async function NewClassGroupPage() {
  await requireRole([UserRole.ADMIN]);
  const [teachers, subjects, levels] = await Promise.all([
    listUsersByRole(UserRole.TEACHER),
    listActiveSubjects(),
    getLevels(),
  ]);

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Class Group</h1>
        <p className="text-muted-foreground">Set up the learning group before adding lessons.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Group Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ClassGroupForm teachers={teachers} subjects={subjects} levels={levels} />
        </CardContent>
      </Card>
    </main>
  );
}
