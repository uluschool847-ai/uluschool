import { UserRole } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { isStorageObjectReferenced } from "@/lib/repositories/storage-reference-repository";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const runPostgres = process.env.RUN_TASK3_POSTGRES_INTEGRATION === "1";
const suite = describe.skipIf(!runPostgres);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const id = (name: string) => `t3-reference-${runId}-${name}`;
const teacherId = id("teacher");
const studentId = id("student");

const currentKey = `private/teachers/${teacherId}/materials/current.pdf`;
const legacyKey = `uploads/references/${runId}.pdf`;
const legacyAlias = `/public/${legacyKey}`;

async function createUsers() {
  await prisma.appUser.createMany({
    data: [
      {
        id: teacherId,
        email: `${teacherId}@example.com`,
        fullName: "Reference teacher",
        role: UserRole.TEACHER,
        passwordHash: "not-used",
        isActive: true,
      },
      {
        id: studentId,
        email: `${studentId}@example.com`,
        fullName: "Reference student",
        role: UserRole.STUDENT,
        passwordHash: "not-used",
        isActive: true,
      },
    ],
  });
}

async function cleanupFixtures() {
  const fixtureIds = { startsWith: `t3-reference-${runId}-` };
  await prisma.teacher.deleteMany({ where: { id: fixtureIds } });
  await prisma.attachment.deleteMany({ where: { id: fixtureIds } });
  await prisma.submission.deleteMany({ where: { id: fixtureIds } });
  await prisma.assignment.deleteMany({ where: { id: fixtureIds } });
  await prisma.courseMaterial.deleteMany({ where: { id: fixtureIds } });
  await prisma.reportSnapshot.deleteMany({ where: { id: fixtureIds } });
  await prisma.academicTerm.deleteMany({ where: { id: fixtureIds } });
  await prisma.scheduledClass.deleteMany({ where: { id: fixtureIds } });
  await prisma.classGroup.deleteMany({ where: { id: fixtureIds } });
  await prisma.appUser.deleteMany({ where: { id: { in: [teacherId, studentId] } } });
}

suite("storage reference PostgreSQL aliases", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await prisma.$connect();
    await createUsers();
  });

  afterEach(async () => {
    await cleanupFixtures();
    await createUsers();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it("retains current and legacy aliases stored in every durable reference column", async () => {
    const classGroupId = id("group");
    const scheduledClassId = id("class");
    const assignmentId = id("assignment");
    const termId = id("term");
    await prisma.classGroup.create({
      data: {
        id: classGroupId,
        name: "Reference group",
        teacherId,
        students: { connect: { id: studentId } },
      },
    });
    await prisma.scheduledClass.create({
      data: {
        id: scheduledClassId,
        title: "Reference class",
        startAt: new Date("2026-07-15T09:00:00.000Z"),
        endAt: new Date("2026-07-15T10:00:00.000Z"),
        teacherId,
        classGroupId,
      },
    });
    await prisma.courseMaterial.create({
      data: {
        id: id("material"),
        title: "Reference material",
        fileUrl: legacyAlias,
        scheduledClassId,
        teacherId,
      },
    });
    await prisma.attachment.create({
      data: {
        id: id("attachment"),
        filename: "current.pdf",
        storageKey: storageUrlForKey(currentKey),
        mimeType: "application/pdf",
        size: 1,
      },
    });
    await prisma.assignment.create({
      data: {
        id: assignmentId,
        title: "Reference assignment",
        description: "Reference assignment description",
        dueDate: new Date("2026-07-16T09:00:00.000Z"),
        scheduledClassId,
        teacherId,
      },
    });
    await prisma.submission.create({
      data: {
        id: id("submission"),
        studentId,
        assignmentId,
        contentUrl: legacyKey.slice("uploads/".length),
      },
    });
    await prisma.academicTerm.create({
      data: {
        id: termId,
        name: "Reference term",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
      },
    });
    await prisma.reportSnapshot.create({
      data: {
        id: id("report"),
        studentId,
        classGroupId,
        academicTermId: termId,
        generatedByTeacherId: teacherId,
        snapshotData: {},
        pdfStorageKey: legacyAlias,
      },
    });
    await prisma.teacher.create({
      data: {
        id: id("teacher-photo"),
        fullName: "Reference photo",
        title: "Teacher",
        bio: "Reference photo storage fixture.",
        photoUrl: legacyKey,
      },
    });

    await expect(isStorageObjectReferenced(currentKey)).resolves.toBe(true);
    await expect(isStorageObjectReferenced(legacyKey)).resolves.toBe(true);
    await expect(
      prisma.$transaction((transaction) => isStorageObjectReferenced(legacyAlias, transaction)),
    ).resolves.toBe(true);
  });

  it("does not classify a truly unreferenced object as live", async () => {
    const unreferenced = `private/teachers/${teacherId}/materials/unreferenced.pdf`;

    await expect(isStorageObjectReferenced(unreferenced)).resolves.toBe(false);
  });
});
