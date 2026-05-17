import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClassGroupLessons } from "@/components/admin/classes/ClassGroupLessons";
import { ClassGroupStudentEnrollments } from "@/components/admin/classes/ClassGroupStudentEnrollments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import {
  getClassGroupById,
  listAvailableStudentsForClassGroup,
  listClassGroupLessons,
} from "@/lib/repositories/class-group-repository";

export const metadata: Metadata = {
  title: "Class Group Details",
};

type ClassGroupDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    classMessage?: string;
    classError?: string;
  }>;
};

function formatDate(value: Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export default async function ClassGroupDetailPage({
  params,
  searchParams,
}: ClassGroupDetailPageProps) {
  await requireRole([UserRole.ADMIN]);
  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : {};
  const classGroup = await getClassGroupById(id);

  if (!classGroup) {
    notFound();
  }

  const [availableStudents, lessons] = await Promise.all([
    listAvailableStudentsForClassGroup(id),
    listClassGroupLessons(id),
  ]);

  const now = new Date();
  const upcomingLessons = lessons.filter((lesson) => new Date(lesson.startAt) >= now);
  const pastLessons = lessons.filter((lesson) => new Date(lesson.startAt) < now);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{classGroup.name}</h1>
          <p className="text-muted-foreground">Class group profile and lessons.</p>
        </div>
        <Button asChild variant="secondary">
          <Link href={`/admin/classes/${classGroup.id}/edit`}>Edit Class Group</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <p>Status</p>
          <p>{classGroup.status.toLowerCase()}</p>
          <p>Subject</p>
          <p>{classGroup.subject?.name ?? "General"}</p>
          <p>Level</p>
          <p>{classGroup.level?.name ?? "Any level"}</p>
          <p>Teacher</p>
          <p>{classGroup.teacher?.fullName ?? "Unassigned"}</p>
          <p>
            Students: {classGroup.studentsCount} / {classGroup.capacity ?? "No limit"}
          </p>
          <p>Start date: {formatDate(classGroup.startDate)}</p>
          <p>End date: {formatDate(classGroup.endDate)}</p>
          {classGroup.description ? (
            <p className="md:col-span-2">Description: {classGroup.description}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <ClassGroupStudentEnrollments
            classGroupId={classGroup.id}
            currentStudents={classGroup.students}
            availableStudents={availableStudents}
            flashMessage={resolvedSearch.classMessage}
            flashError={resolvedSearch.classError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <ClassGroupLessons
            classGroupId={classGroup.id}
            upcomingLessons={upcomingLessons}
            pastLessons={pastLessons}
          />
        </CardContent>
      </Card>
    </main>
  );
}
