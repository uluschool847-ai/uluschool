import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ProfileDate = Date | string | null | undefined;

function dateOrNull(value: ProfileDate) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapTeacher(teacher?: { fullName?: string | null; id?: string | null } | null) {
  if (!teacher) return null;
  return {
    fullName: teacher.fullName ?? null,
    id: teacher.id ?? null,
  };
}

function mapSubject(subject?: { id?: string | null; name?: string | null } | null) {
  if (!subject) return null;
  return {
    id: subject.id ?? null,
    name: subject.name ?? null,
  };
}

export async function getStudentProfile(studentId: string) {
  const student = await prisma.appUser.findFirst({
    where: {
      id: studentId,
      role: UserRole.STUDENT,
    },
    include: {
      enrolledClassGroups: {
        include: {
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, fullName: true } },
        },
        orderBy: { name: "asc" },
      },
      enrolledClasses: {
        include: {
          classGroup: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, fullName: true } },
        },
        orderBy: [{ startAt: "asc" }, { title: "asc" }],
      },
    },
  });

  if (!student) return null;

  return {
    classGroups: student.enrolledClassGroups.map((group) => ({
      id: group.id,
      name: group.name,
      status: group.status,
      subject: mapSubject(group.subject),
      teacher: mapTeacher(group.teacher),
    })),
    createdAt: dateOrNull(student.createdAt),
    directClasses: student.enrolledClasses.map((lesson) => ({
      classGroup: lesson.classGroup
        ? {
            id: lesson.classGroup.id,
            name: lesson.classGroup.name,
          }
        : null,
      id: lesson.id,
      startAt: dateOrNull(lesson.startAt),
      status: lesson.status,
      subject: mapSubject(lesson.subject),
      teacher: mapTeacher(lesson.teacher),
      title: lesson.title,
    })),
    email: student.email,
    fullName: student.fullName,
    id: student.id,
    isActive: student.isActive,
    learningStatus: student.learningStatus,
    role: student.role,
    updatedAt: dateOrNull(student.updatedAt),
  };
}
