import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClassGroupForm } from "@/components/admin/classes/ClassGroupForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getLevels } from "@/lib/repositories/catalogue-repository";
import { getClassGroupById } from "@/lib/repositories/class-group-repository";
import { listUsersByRole } from "@/lib/repositories/portal-repository";
import { listActiveSubjects } from "@/lib/repositories/subject-repository";

export const metadata: Metadata = {
  title: "Edit Class Group",
};

type EditClassGroupPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditClassGroupPage({ params }: EditClassGroupPageProps) {
  await requireRole([UserRole.ADMIN]);
  const { id } = await params;
  const [classGroup, teachers, subjects, levels] = await Promise.all([
    getClassGroupById(id),
    listUsersByRole(UserRole.TEACHER),
    listActiveSubjects(),
    getLevels(),
  ]);

  if (!classGroup) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Class Group</h1>
        <p className="text-muted-foreground">{classGroup.name}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Group Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ClassGroupForm
            classGroup={classGroup}
            teachers={teachers}
            subjects={subjects}
            levels={levels}
            currentTeacher={classGroup.teacher}
            currentSubject={classGroup.subject}
            currentLevel={classGroup.level}
          />
        </CardContent>
      </Card>
    </main>
  );
}
