import { ClassGroupStatus, UserRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { HomeworkForm } from "@/app/portal/teacher/components/HomeworkForm";
import { requireRole } from "@/lib/auth/session";
import { getSubjects } from "@/lib/repositories/catalogue-repository";
import { getHomeworkAssignmentById } from "@/lib/repositories/homework-repository";
import { listTeacherClassGroups } from "@/lib/repositories/teacher-classes-repository";

type Params = {
  assignmentId: string;
};

type HomeworkAssignment = Awaited<ReturnType<typeof getHomeworkAssignmentById>> & {
  archivedAt?: Date | null;
  subjectId?: string | null;
  scheduledClassId?: string | null;
  scheduledClass?: {
    classGroupId?: string | null;
    classGroup?: { id?: string | null } | null;
  } | null;
};

async function resolveParams(params: Promise<Params> | Params) {
  return params instanceof Promise ? params : Promise.resolve(params);
}

function dateValue(date: Date | string | null | undefined) {
  if (!date) return "";
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function classValue(assignment: HomeworkAssignment) {
  return (
    assignment.scheduledClass?.classGroup?.id ??
    assignment.scheduledClass?.classGroupId ??
    assignment.scheduledClassId ??
    ""
  );
}

export default async function EditTeacherAssignmentPage({
  params,
}: {
  params: Promise<Params> | Params;
}) {
  const session = await requireRole([UserRole.TEACHER]);
  const { assignmentId } = await resolveParams(params);
  const assignment = (await getHomeworkAssignmentById(
    assignmentId,
    session.uid,
  )) as HomeworkAssignment | null;

  if (!assignment) {
    notFound();
  }

  if (assignment.archivedAt) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight">{assignment.title}</h1>
        <p>Archived assignment cannot be edited</p>
        <a href="/portal/teacher/assignments">Back to assignments</a>
      </main>
    );
  }

  const [classGroups, subjects] = await Promise.all([
    listTeacherClassGroups(session.uid, { status: ClassGroupStatus.ACTIVE }),
    getSubjects(),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit homework</h1>
        <p className="mt-2 text-muted-foreground">Update this homework assignment.</p>
      </div>

      <HomeworkForm
        mode="edit"
        assignmentId={assignment.id}
        classes={classGroups.map((group) => ({ id: group.id, name: group.name }))}
        subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
        initialValues={{
          title: assignment.title,
          description: assignment.description ?? "",
          classId: classValue(assignment),
          subjectId: assignment.subjectId ?? "",
          dueDate: dateValue(assignment.dueDate),
        }}
        cancelHref="/portal/teacher/assignments"
      />
    </main>
  );
}
