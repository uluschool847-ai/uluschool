import { Prisma, type PrismaClient, UserRole } from "@prisma/client";

import { APPROVED_PUBLIC_TEACHERS } from "@/lib/content/approved-teachers";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";

type SyncApprovedTeachersInput = {
  actorId: string;
  database?: PrismaClient;
};

type TeacherSnapshot = {
  fullName: string;
  title: string;
  bio: string;
  photoUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  subjectIds: string[];
};

function sorted(values: Iterable<string>) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function snapshotsMatch(left: TeacherSnapshot, right: TeacherSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function syncApprovedTeachers({
  actorId,
  database = prisma,
}: SyncApprovedTeachersInput): Promise<{ created: number; updated: number; deleted: number }> {
  return database.$transaction(
    async (tx) => {
      const actor = await tx.appUser.findUnique({
        where: { id: actorId },
        select: { id: true, role: true, isActive: true },
      });
      if (!actor || actor.role !== UserRole.ADMIN || !actor.isActive) {
        throw new Error("Teacher synchronization requires an active administrator.");
      }

      const requestedSubjectSlugs = sorted(
        new Set(APPROVED_PUBLIC_TEACHERS.flatMap((teacher) => [...teacher.subjectSlugs])),
      );
      const subjectRecords = await tx.subject.findMany({
        where: { slug: { in: requestedSubjectSlugs } },
        select: { id: true, slug: true },
      });
      const subjectIdBySlug = new Map(subjectRecords.map((subject) => [subject.slug, subject.id]));
      const missingSubjectSlugs = requestedSubjectSlugs.filter(
        (slug) => !subjectIdBySlug.has(slug),
      );
      if (missingSubjectSlugs.length > 0) {
        throw new Error(`Missing required teacher subjects: ${missingSubjectSlugs.join(", ")}.`);
      }

      const existingTeachers = await tx.teacher.findMany({
        include: {
          teacherSubjects: {
            select: { subjectId: true },
          },
        },
        orderBy: { id: "asc" },
      });
      const retainedTeacherIds = new Set<string>();
      const result = { created: 0, updated: 0, deleted: 0 };

      for (const approved of APPROVED_PUBLIC_TEACHERS) {
        const subjectIds = sorted(
          approved.subjectSlugs.map((slug) => {
            const subjectId = subjectIdBySlug.get(slug);
            if (!subjectId) {
              throw new Error(`Missing required teacher subject: ${slug}.`);
            }
            return subjectId;
          }),
        );
        const desiredSnapshot: TeacherSnapshot = {
          fullName: approved.fullName,
          title: approved.title,
          bio: approved.bio,
          photoUrl: approved.photoUrl,
          displayOrder: approved.displayOrder,
          isActive: approved.isActive,
          subjectIds,
        };
        const existing = existingTeachers.find(
          (teacher) =>
            teacher.fullName === approved.fullName && !retainedTeacherIds.has(teacher.id),
        );

        if (!existing) {
          const created = await tx.teacher.create({
            data: {
              fullName: approved.fullName,
              title: approved.title,
              bio: approved.bio,
              photoUrl: approved.photoUrl,
              displayOrder: approved.displayOrder,
              isActive: approved.isActive,
            },
          });
          if (subjectIds.length > 0) {
            await tx.teacherSubject.createMany({
              data: subjectIds.map((subjectId) => ({ teacherId: created.id, subjectId })),
            });
          }
          await createAdminAuditLog(
            {
              adminUserId: actorId,
              action: "TEACHER_PROFILE_CREATED",
              targetType: "teacher",
              targetId: created.id,
              before: null,
              after: desiredSnapshot,
              meta: { source: "approved-public-teachers-sync" },
            },
            tx,
          );
          retainedTeacherIds.add(created.id);
          result.created += 1;
          continue;
        }

        retainedTeacherIds.add(existing.id);
        const currentSnapshot: TeacherSnapshot = {
          fullName: existing.fullName,
          title: existing.title,
          bio: existing.bio,
          photoUrl: existing.photoUrl,
          displayOrder: existing.displayOrder,
          isActive: existing.isActive,
          subjectIds: sorted(existing.teacherSubjects.map((link) => link.subjectId)),
        };
        if (snapshotsMatch(currentSnapshot, desiredSnapshot)) {
          continue;
        }

        await tx.teacher.update({
          where: { id: existing.id },
          data: {
            fullName: approved.fullName,
            title: approved.title,
            bio: approved.bio,
            photoUrl: approved.photoUrl,
            displayOrder: approved.displayOrder,
            isActive: approved.isActive,
          },
        });
        await tx.teacherSubject.deleteMany({ where: { teacherId: existing.id } });
        if (subjectIds.length > 0) {
          await tx.teacherSubject.createMany({
            data: subjectIds.map((subjectId) => ({ teacherId: existing.id, subjectId })),
          });
        }
        await createAdminAuditLog(
          {
            adminUserId: actorId,
            action: "TEACHER_PROFILE_UPDATED",
            targetType: "teacher",
            targetId: existing.id,
            before: currentSnapshot,
            after: desiredSnapshot,
            meta: { source: "approved-public-teachers-sync" },
          },
          tx,
        );
        result.updated += 1;
      }

      for (const extra of existingTeachers.filter(
        (teacher) => !retainedTeacherIds.has(teacher.id),
      )) {
        const before: TeacherSnapshot = {
          fullName: extra.fullName,
          title: extra.title,
          bio: extra.bio,
          photoUrl: extra.photoUrl,
          displayOrder: extra.displayOrder,
          isActive: extra.isActive,
          subjectIds: sorted(extra.teacherSubjects.map((link) => link.subjectId)),
        };
        await createAdminAuditLog(
          {
            adminUserId: actorId,
            action: "TEACHER_PROFILE_DELETED",
            targetType: "teacher",
            targetId: extra.id,
            before,
            after: null,
            meta: { source: "approved-public-teachers-sync" },
          },
          tx,
        );
        await tx.teacher.delete({ where: { id: extra.id } });
        result.deleted += 1;
      }

      return result;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}
