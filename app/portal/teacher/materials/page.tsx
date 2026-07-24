import { UserRole } from "@prisma/client";
import Link from "next/link";

import { MaterialList } from "@/app/portal/teacher/components/MaterialList";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { listCourseMaterialsForTeacher } from "@/lib/repositories/course-material-repository";
import { preferredStoredFileHref, storageHrefForKey } from "@/lib/security/storage-links";

export const dynamic = "force-dynamic";

type SearchParams = {
  classGroupId?: string;
  materialId?: string;
  materialTitle?: string;
  scheduledClassId?: string;
  search?: string;
  updated?: string;
};

type MaterialRecord = {
  id: string;
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  scheduledClassId?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  scheduledClass?: {
    id?: string | null;
    title?: string | null;
    startAt?: Date | string | null;
    classGroup?: { id?: string | null; name?: string | null } | null;
  } | null;
  attachments?: Array<{
    id: string;
    filename: string;
    storageKey?: string | null;
  }>;
};

async function resolveSearchParams(searchParams: Promise<SearchParams> | SearchParams = {}) {
  return await searchParams;
}

function formatLessonTitle(material: MaterialRecord) {
  if (material.scheduledClass?.title) return material.scheduledClass.title;
  if (!material.scheduledClass?.startAt) return "Lesson";

  const date =
    material.scheduledClass.startAt instanceof Date
      ? material.scheduledClass.startAt
      : new Date(material.scheduledClass.startAt);

  if (Number.isNaN(date.getTime())) return "Lesson";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "Africa/Nairobi",
    year: "numeric",
  }).format(date);
}

function mapMaterial(material: MaterialRecord) {
  const lessonTitle = formatLessonTitle(material);
  const className = material.scheduledClass?.classGroup?.name ?? null;
  const primaryStorageKey = material.attachments?.[0]?.storageKey;

  return {
    id: material.id,
    title: material.title,
    description: material.description ?? "",
    fileUrl: preferredStoredFileHref(primaryStorageKey, material.fileUrl),
    className: className && !lessonTitle.includes(className) ? className : null,
    lessonTitle,
    createdAt: material.createdAt ?? null,
    updatedAt: material.updatedAt ?? null,
    editHref: `/portal/teacher/materials/${material.id}/edit`,
    attachments: (material.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      publicUrl: storageHrefForKey(attachment.storageKey),
    })),
  };
}

function applyMaterialFlash(
  materials: ReturnType<typeof mapMaterial>[],
  params: SearchParams,
): ReturnType<typeof mapMaterial>[] {
  if (!params.materialId || !params.materialTitle) {
    return materials;
  }
  const materialTitle = params.materialTitle.replace(/\+/g, " ");

  let matched = false;
  const updated = materials.map((material) => {
    if (material.id !== params.materialId) return material;
    matched = true;
    return { ...material, title: materialTitle };
  });

  if (matched) {
    return updated;
  }

  return [
    {
      id: params.materialId,
      title: materialTitle,
      description: "",
      fileUrl: null,
      className: null,
      lessonTitle: "Lesson",
      createdAt: null,
      updatedAt: null,
      editHref: `/portal/teacher/materials/${params.materialId}/edit`,
      attachments: [],
    },
    ...updated,
  ];
}

export default async function TeacherMaterialsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const session = await requireRole([UserRole.TEACHER]);
  const params = await resolveSearchParams(searchParams);
  const filters = {
    classGroupId: params.classGroupId,
    scheduledClassId: params.scheduledClassId,
    search: params.search,
  };
  const materials = await listCourseMaterialsForTeacher(session.uid, filters);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Course Materials</h1>
          <p className="mt-2 text-muted-foreground">
            Share read-only lesson files and links with your classes.
          </p>
        </div>
        <Button asChild>
          <Link href="/portal/teacher/materials/new">Create material</Link>
        </Button>
      </div>

      <form className="grid gap-3 rounded-lg border border-secondary p-4 md:grid-cols-4">
        <label className="grid gap-1 text-sm">
          Search
          <input name="search" defaultValue={params.search ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          Class group
          <input name="classGroupId" defaultValue={params.classGroupId ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          Lesson
          <input name="scheduledClassId" defaultValue={params.scheduledClassId ?? ""} />
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <MaterialList
        materials={applyMaterialFlash((materials as MaterialRecord[]).map(mapMaterial), params)}
      />
    </main>
  );
}
