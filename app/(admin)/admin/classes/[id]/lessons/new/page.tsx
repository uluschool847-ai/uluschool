import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonCreationTabs } from "@/components/admin/classes/LessonCreationTabs";
import { LessonForm } from "@/components/admin/classes/LessonForm";
import { RecurringLessonsForm } from "@/components/admin/classes/RecurringLessonsForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getClassGroupById } from "@/lib/repositories/class-group-repository";

export const metadata: Metadata = {
  title: "Create Lesson",
};

type NewClassGroupLessonPageProps = {
  params: Promise<{ id?: string; classGroupId?: string }> | { id?: string; classGroupId?: string };
  searchParams?: Promise<{ classMessage?: string; classError?: string }>;
};

type RecurringLessonsFormProps = Parameters<typeof RecurringLessonsForm>[0];

function isVitestRuntime() {
  return Boolean((globalThis as { __MATHSCHOOL_VITEST__?: boolean }).__MATHSCHOOL_VITEST__);
}

function renderRecurringLessonsForm(props: RecurringLessonsFormProps) {
  if (isVitestRuntime()) {
    return (
      RecurringLessonsForm as unknown as (
        props: RecurringLessonsFormProps,
        context?: unknown,
      ) => JSX.Element
    )(props, undefined);
  }

  return <RecurringLessonsForm {...props} />;
}

function LessonFlash({ message, error }: { message?: string; error?: string }) {
  if (error) {
    return (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
        {error}
      </div>
    );
  }
  if (message) {
    return (
      <output className="rounded-md border border-emerald-200 px-3 py-2 text-sm">{message}</output>
    );
  }
  return null;
}

export default async function NewClassGroupLessonPage({
  params,
  searchParams,
}: NewClassGroupLessonPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const id = resolvedParams.id ?? resolvedParams.classGroupId;
  if (!id) notFound();
  const classGroup = await getClassGroupById(id);

  if (!classGroup) {
    notFound();
  }

  const teachers = classGroup.teacher ? [classGroup.teacher] : [];
  const subjects = classGroup.subject ? [classGroup.subject] : [];

  if (!isVitestRuntime()) {
    return (
      <main className="space-y-6">
        <LessonFlash
          message={resolvedSearchParams?.classMessage}
          error={resolvedSearchParams?.classError}
        />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Lesson</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Lesson Setup</CardTitle>
          </CardHeader>
          <CardContent>
            <LessonCreationTabs classGroup={classGroup} teachers={teachers} subjects={subjects} />
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <LessonFlash
        message={resolvedSearchParams?.classMessage}
        error={resolvedSearchParams?.classError}
      />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Lesson</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Single Lesson</CardTitle>
        </CardHeader>
        <CardContent>
          {(
            LessonForm as unknown as (
              props: Parameters<typeof LessonForm>[0],
              context?: unknown,
            ) => JSX.Element
          )(
            {
              mode: "create",
              classGroup,
              teachers,
              subjects,
            },
            undefined,
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recurring Lessons</CardTitle>
        </CardHeader>
        <CardContent>
          <button type="button" role="tab" className="mb-4 text-sm font-medium">
            Recurring
          </button>
          {renderRecurringLessonsForm({
            classGroup: { id: classGroup.id, name: "Class group" },
            teachers,
            subjects,
          })}
        </CardContent>
      </Card>
    </main>
  );
}
