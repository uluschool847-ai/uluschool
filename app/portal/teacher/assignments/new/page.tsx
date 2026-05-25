import { ClassGroupStatus, UserRole } from "@prisma/client";

import { HomeworkForm } from "@/app/portal/teacher/components/HomeworkForm";
import { requireRole } from "@/lib/auth/session";
import { getSubjects } from "@/lib/repositories/catalogue-repository";
import { listTeacherClassGroups } from "@/lib/repositories/teacher-classes-repository";

type SearchParams = {
  classGroupId?: string;
};

async function resolveSearchParams(searchParams: Promise<SearchParams> | SearchParams = {}) {
  return searchParams instanceof Promise ? searchParams : Promise.resolve(searchParams);
}

export default async function NewTeacherAssignmentPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const session = await requireRole([UserRole.TEACHER]);
  const params = await resolveSearchParams(searchParams);
  const [classGroups, subjects] = await Promise.all([
    listTeacherClassGroups(session.uid, { status: ClassGroupStatus.ACTIVE }),
    getSubjects(),
  ]);
  const classOptions = classGroups.map((group) => ({ id: group.id, name: group.name }));

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create homework</h1>
        <p className="mt-2 text-muted-foreground">
          Assign homework to one of your teacher-owned classes or groups.
        </p>
      </div>

      {classOptions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-secondary bg-secondary/20 p-4 text-sm text-muted-foreground">
          No classes available for homework.
        </p>
      ) : null}

      <HomeworkForm
        mode="create"
        classes={classOptions}
        subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
        initialValues={{ classId: params.classGroupId ?? "" }}
        cancelHref="/portal/teacher/assignments"
        disabled={classOptions.length === 0}
      />
    </main>
  );
}
