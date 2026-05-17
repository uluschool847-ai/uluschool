import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonForm } from "@/components/admin/classes/LessonForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getLessonById } from "@/lib/repositories/lesson-repository";

export const metadata: Metadata = {
  title: "Edit Lesson",
};

type EditClassGroupLessonPageProps = {
  params:
    | Promise<{ id?: string; classGroupId?: string; lessonId: string }>
    | { id?: string; classGroupId?: string; lessonId: string };
};

export default async function EditClassGroupLessonPage({ params }: EditClassGroupLessonPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;
  const id = resolvedParams.id ?? resolvedParams.classGroupId;
  const { lessonId } = resolvedParams;
  const lesson = await getLessonById(lessonId);

  if (!lesson || lesson.classGroupId !== id || !lesson.classGroup) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Lesson</h1>
        <p className="text-muted-foreground">{lesson.classGroup.name}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lesson Details</CardTitle>
        </CardHeader>
        <CardContent>
          {(
            LessonForm as unknown as (
              props: Parameters<typeof LessonForm>[0],
              context?: unknown,
            ) => JSX.Element
          )(
            {
              mode: "edit",
              classGroup: lesson.classGroup,
              lesson,
              teachers: lesson.teacher ? [lesson.teacher] : [],
              subjects: lesson.subject ? [lesson.subject] : [],
            },
            undefined,
          )}
        </CardContent>
      </Card>
    </main>
  );
}
