import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { MaterialForm } from "@/app/portal/teacher/components/MaterialForm";
import { requireRole } from "@/lib/auth/session";
import { getCourseMaterialForTeacher } from "@/lib/repositories/course-material-repository";
import { listTeacherSchedule } from "@/lib/repositories/teacher-schedule-repository";
import { preferredStoredFileHref } from "@/lib/security/storage-links";

type Params = {
  materialId: string;
};

type LessonOptionRecord = {
  id: string;
  title: string;
  classGroup?: { name?: string | null } | null;
};

type MaterialRecord = Awaited<ReturnType<typeof getCourseMaterialForTeacher>> & {
  attachments?: Array<{ storageKey: string }>;
  scheduledClassId?: string | null;
};

async function resolveParams(params: Promise<Params> | Params) {
  return params instanceof Promise ? params : Promise.resolve(params);
}

function mapLessonOption(lesson: LessonOptionRecord) {
  return {
    id: lesson.id,
    title: lesson.classGroup?.name ? `${lesson.title} - ${lesson.classGroup.name}` : lesson.title,
  };
}

export default async function EditTeacherMaterialPage({
  params,
}: {
  params: Promise<Params> | Params;
}) {
  const session = await requireRole([UserRole.TEACHER]);
  const { materialId } = await resolveParams(params);
  const material = (await getCourseMaterialForTeacher(
    materialId,
    session.uid,
  )) as MaterialRecord | null;

  if (!material) {
    notFound();
  }

  const lessons = (await listTeacherSchedule(session.uid, {})) as LessonOptionRecord[];
  const fileUrl =
    preferredStoredFileHref(material.attachments?.[0]?.storageKey, material.fileUrl) ?? "";

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit material</h1>
        <p className="mt-2 text-muted-foreground">Update this lesson material.</p>
      </div>

      <MaterialForm
        mode="edit"
        materialId={material.id}
        lessons={lessons.map(mapLessonOption)}
        initialValues={{
          title: material.title,
          description: material.description ?? "",
          fileUrl,
          scheduledClassId: material.scheduledClassId ?? "",
        }}
        cancelHref="/portal/teacher/materials"
      />
    </main>
  );
}
