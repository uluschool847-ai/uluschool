import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  type CourseMaterialFilters,
  listStudentCourseMaterials,
} from "@/lib/repositories/course-material-repository";

export type ParentMaterialFilters = CourseMaterialFilters;

export type ParentMaterialRow = Awaited<ReturnType<typeof listStudentCourseMaterials>>[number];

async function isLinkedParentChild(parentId: string, studentId: string) {
  const parent = await prisma.appUser.findFirst({
    where: {
      id: parentId,
      role: UserRole.PARENT,
      children: { some: { id: studentId } },
    },
    select: { id: true },
  });

  return Boolean(parent);
}

export async function listMaterialsForParentChild(
  parentId: string,
  studentId: string,
  filters: ParentMaterialFilters = {},
) {
  if (!(await isLinkedParentChild(parentId, studentId))) {
    return [];
  }

  return listStudentCourseMaterials(studentId, filters);
}
