import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ParentProfileChild = {
  id: string;
  name: string;
  email: string;
  classGroups: {
    id: string;
    name: string;
    status?: string | null;
    subject?: { id: string; name: string } | null;
  }[];
  classes: {
    id: string;
    title: string;
    subject?: { id: string; name: string } | null;
    classGroup?: { id: string; name: string } | null;
  }[];
};

export type ParentProfile = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  status: "Active" | "Inactive";
  children: ParentProfileChild[];
  createdAt: Date;
  updatedAt: Date;
};

type ParentProfileRecord = NonNullable<Awaited<ReturnType<typeof findParentProfileRecord>>>;
type ParentProfileChildRecord = ParentProfileRecord["children"][number];

function mapChild(child: ParentProfileChildRecord): ParentProfileChild {
  return {
    classGroups: (child.enrolledClassGroups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      status: group.status,
      subject: group.subject ? { id: group.subject.id, name: group.subject.name } : null,
    })),
    classes: (child.enrolledClasses ?? []).map((scheduledClass) => ({
      classGroup: scheduledClass.classGroup
        ? { id: scheduledClass.classGroup.id, name: scheduledClass.classGroup.name }
        : null,
      id: scheduledClass.id,
      subject: scheduledClass.subject
        ? { id: scheduledClass.subject.id, name: scheduledClass.subject.name }
        : null,
      title: scheduledClass.title,
    })),
    email: child.email,
    id: child.id,
    name: child.fullName,
  };
}

function mapParent(record: ParentProfileRecord): ParentProfile {
  return {
    children: record.children.map(mapChild),
    createdAt: record.createdAt,
    email: record.email,
    id: record.id,
    isActive: record.isActive,
    name: record.fullName,
    role: UserRole.PARENT,
    status: record.isActive ? "Active" : "Inactive",
    updatedAt: record.updatedAt,
  };
}

function findParentProfileRecord(parentId: string) {
  return prisma.appUser.findFirst({
    select: {
      children: {
        orderBy: { fullName: "asc" },
        select: {
          email: true,
          enrolledClassGroups: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              status: true,
              subject: { select: { id: true, name: true } },
            },
          },
          enrolledClasses: {
            orderBy: { startAt: "asc" },
            select: {
              classGroup: { select: { id: true, name: true } },
              id: true,
              subject: { select: { id: true, name: true } },
              title: true,
            },
          },
          fullName: true,
          id: true,
        },
      },
      createdAt: true,
      email: true,
      fullName: true,
      id: true,
      isActive: true,
      role: true,
      updatedAt: true,
    },
    where: {
      id: parentId,
      role: UserRole.PARENT,
    },
  });
}

export async function getParentProfile(parentId: string): Promise<ParentProfile | null> {
  const parent = await findParentProfileRecord(parentId);
  if (!parent || parent.role !== UserRole.PARENT) return null;

  return mapParent(parent);
}
