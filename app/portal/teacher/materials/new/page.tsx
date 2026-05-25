import { UserRole } from "@prisma/client";

import { MaterialForm } from "@/app/portal/teacher/components/MaterialForm";
import { requireRole } from "@/lib/auth/session";
import { listTeacherSchedule } from "@/lib/repositories/teacher-schedule-repository";

type SearchParams = {
  scheduledClassId?: string;
};

type LessonOptionRecord = {
  id: string;
  title: string;
  classGroup?: { name?: string | null } | null;
};

async function resolveSearchParams(searchParams: Promise<SearchParams> | SearchParams = {}) {
  return searchParams instanceof Promise ? searchParams : Promise.resolve(searchParams);
}

function mapLessonOption(lesson: LessonOptionRecord) {
  return {
    id: lesson.id,
    title: lesson.classGroup?.name ? `${lesson.title} - ${lesson.classGroup.name}` : lesson.title,
  };
}

export default async function NewTeacherMaterialPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const session = await requireRole([UserRole.TEACHER]);
  const params = await resolveSearchParams(searchParams);
  const lessons = (await listTeacherSchedule(session.uid, {})) as LessonOptionRecord[];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create material</h1>
        <p className="mt-2 text-muted-foreground">
          Add a safe file URL for one of your scheduled lessons.
        </p>
      </div>

      <MaterialForm
        mode="create"
        lessons={lessons.map(mapLessonOption)}
        initialValues={{ scheduledClassId: params.scheduledClassId ?? "" }}
        cancelHref="/portal/teacher/materials"
      />
    </main>
  );
}
