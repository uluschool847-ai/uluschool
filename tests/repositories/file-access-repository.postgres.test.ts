import { UserRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  canAccessPrivateStorageKey,
  isPublishedTeacherPhoto,
} from "@/lib/repositories/file-access-repository";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const runPostgres = process.env.RUN_S3_POSTGRES_INTEGRATION === "1";
const suite = describe.skipIf(!runPostgres);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const id = (name: string) => `s3-${runId}-${name}`;

const keys = {
  material: `private/teachers/${id("teacher-a")}/materials/lesson.pdf`,
  submission: `private/teachers/${id("teacher-a")}/submissions/work.pdf`,
  report: `private/teachers/${id("teacher-a")}/reports/report.pdf`,
  orphan: `private/teachers/${id("teacher-a")}/materials/orphan.pdf`,
  photo: `public/teachers/${id("admin")}/photo.webp`,
  inactivePhoto: `public/teachers/${id("admin")}/inactive.webp`,
  externalPhoto: `public/teachers/${id("admin")}/external.webp`,
};

function user(userId: string, role: UserRole) {
  return {
    id: userId,
    email: `${userId}@example.com`,
    fullName: userId,
    role,
    passwordHash: "not-used",
    isActive: true,
  };
}

suite("file access PostgreSQL IDOR relations", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.appUser.createMany({
      data: [
        user(id("admin"), UserRole.ADMIN),
        user(id("teacher-a"), UserRole.TEACHER),
        user(id("teacher-b"), UserRole.TEACHER),
        user(id("student-a"), UserRole.STUDENT),
        user(id("student-b"), UserRole.STUDENT),
        user(id("parent-a"), UserRole.PARENT),
        user(id("parent-b"), UserRole.PARENT),
      ],
    });
    await prisma.appUser.update({
      where: { id: id("student-a") },
      data: { parents: { connect: { id: id("parent-a") } } },
    });
    await prisma.classGroup.create({
      data: {
        id: id("group"),
        name: "S3 group",
        teacherId: id("teacher-a"),
        students: { connect: { id: id("student-a") } },
      },
    });
    await prisma.scheduledClass.create({
      data: {
        id: id("class"),
        title: "S3 class",
        startAt: new Date("2026-07-14T10:00:00.000Z"),
        endAt: new Date("2026-07-14T11:00:00.000Z"),
        teacherId: id("teacher-a"),
        classGroupId: id("group"),
        students: { connect: { id: id("student-a") } },
      },
    });
    await prisma.courseMaterial.create({
      data: {
        id: id("material"),
        title: "S3 material",
        fileUrl: storageUrlForKey(keys.material),
        scheduledClassId: id("class"),
        teacherId: id("teacher-a"),
        attachments: {
          create: {
            id: id("material-attachment"),
            filename: "lesson.pdf",
            storageKey: keys.material,
            mimeType: "application/pdf",
            size: 10,
          },
        },
      },
    });
    await prisma.assignment.create({
      data: {
        id: id("assignment"),
        title: "S3 assignment",
        description: "S3",
        dueDate: new Date("2026-07-20T10:00:00.000Z"),
        scheduledClassId: id("class"),
        teacherId: id("teacher-a"),
        submissions: {
          create: {
            id: id("submission"),
            studentId: id("student-a"),
            contentUrl: storageUrlForKey(keys.submission),
            attachments: {
              create: {
                id: id("submission-attachment"),
                filename: "work.pdf",
                storageKey: keys.submission,
                mimeType: "application/pdf",
                size: 10,
              },
            },
          },
        },
      },
    });
    await prisma.academicTerm.create({
      data: {
        id: id("term"),
        name: "S3 term",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-31T23:59:59.000Z"),
      },
    });
    await prisma.reportSnapshot.create({
      data: {
        id: id("report"),
        studentId: id("student-a"),
        classGroupId: id("group"),
        academicTermId: id("term"),
        generatedByTeacherId: id("teacher-a"),
        snapshotData: {},
        pdfStorageKey: keys.report,
      },
    });
    await prisma.teacher.createMany({
      data: [
        {
          id: id("published-teacher"),
          fullName: "Published Teacher",
          title: "Teacher",
          bio: "S3",
          photoUrl: storageUrlForKey(keys.photo),
          isActive: true,
        },
        {
          id: id("inactive-teacher"),
          fullName: "Inactive Teacher",
          title: "Teacher",
          bio: "S3",
          photoUrl: storageUrlForKey(keys.inactivePhoto),
          isActive: false,
        },
        {
          id: id("external-teacher"),
          fullName: "External Teacher",
          title: "Teacher",
          bio: "S3",
          photoUrl: "https://images.example.com/photo.webp",
          isActive: true,
        },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.teacher.deleteMany({ where: { id: { startsWith: `s3-${runId}-` } } });
    await prisma.reportSnapshot.deleteMany({ where: { id: id("report") } });
    await prisma.academicTerm.deleteMany({ where: { id: id("term") } });
    await prisma.assignment.deleteMany({ where: { id: id("assignment") } });
    await prisma.courseMaterial.deleteMany({ where: { id: id("material") } });
    await prisma.scheduledClass.deleteMany({ where: { id: id("class") } });
    await prisma.classGroup.deleteMany({ where: { id: id("group") } });
    await prisma.appUser.deleteMany({ where: { id: { startsWith: `s3-${runId}-` } } });
    await prisma.$disconnect();
  }, 60_000);

  it("enforces referenced admin, teacher, student, and parent ownership", async () => {
    await expect(
      canAccessPrivateStorageKey({ uid: id("admin"), role: UserRole.ADMIN }, keys.material),
    ).resolves.toBe(true);
    await expect(
      canAccessPrivateStorageKey({ uid: id("admin"), role: UserRole.ADMIN }, keys.orphan),
    ).resolves.toBe(false);

    for (const key of [keys.material, keys.submission, keys.report]) {
      await expect(
        canAccessPrivateStorageKey({ uid: id("teacher-a"), role: UserRole.TEACHER }, key),
      ).resolves.toBe(true);
      await expect(
        canAccessPrivateStorageKey({ uid: id("teacher-b"), role: UserRole.TEACHER }, key),
      ).resolves.toBe(false);
      await expect(
        canAccessPrivateStorageKey({ uid: id("student-a"), role: UserRole.STUDENT }, key),
      ).resolves.toBe(true);
      await expect(
        canAccessPrivateStorageKey({ uid: id("student-b"), role: UserRole.STUDENT }, key),
      ).resolves.toBe(false);
      await expect(
        canAccessPrivateStorageKey({ uid: id("parent-a"), role: UserRole.PARENT }, key),
      ).resolves.toBe(true);
      await expect(
        canAccessPrivateStorageKey({ uid: id("parent-b"), role: UserRole.PARENT }, key),
      ).resolves.toBe(false);
    }
  });

  it("publishes only the exact active teacher photo application URL", async () => {
    await expect(isPublishedTeacherPhoto(keys.photo)).resolves.toBe(true);
    await expect(isPublishedTeacherPhoto(keys.inactivePhoto)).resolves.toBe(false);
    await expect(isPublishedTeacherPhoto(keys.externalPhoto)).resolves.toBe(false);
    await expect(isPublishedTeacherPhoto(keys.material)).resolves.toBe(false);
  });
});
