import { UserRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
  teacherDirect: `private/teachers/${id("fixture-teacher")}/materials/teacher-direct.pdf`,
  teacherScheduledClass: `private/teachers/${id("fixture-teacher")}/materials/teacher-class.pdf`,
  teacherClassGroup: `private/teachers/${id("fixture-teacher")}/materials/teacher-group.pdf`,
  studentDirect: `private/teachers/${id("fixture-teacher")}/materials/student-direct.pdf`,
  studentClassGroup: `private/teachers/${id("fixture-teacher")}/materials/student-group.pdf`,
  parentDirect: `private/teachers/${id("fixture-teacher")}/materials/parent-direct.pdf`,
  parentClassGroup: `private/teachers/${id("fixture-teacher")}/materials/parent-group.pdf`,
  submission: `private/teachers/${id("teacher-direct")}/submissions/work.pdf`,
  report: `private/teachers/${id("teacher-direct")}/reports/report.pdf`,
  detachedAttachment: `private/teachers/${id("fixture-teacher")}/materials/detached.pdf`,
  nullReportProbe: `private/teachers/${id("fixture-teacher")}/reports/null-report.pdf`,
  orphan: `private/teachers/${id("fixture-teacher")}/materials/orphan.pdf`,
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

type FixtureCleanupStep = {
  label: string;
  run: () => Promise<unknown>;
};

function fixtureCleanupError(label: string, failure: unknown) {
  const detail = failure instanceof Error ? failure.message : String(failure);
  return new Error(`${label} failed: ${detail}`, { cause: failure });
}

async function cleanupPostgresFixture(
  steps: FixtureCleanupStep[],
  disconnect: () => Promise<unknown>,
) {
  const errors: Error[] = [];

  try {
    for (const step of steps) {
      try {
        await step.run();
      } catch (error) {
        errors.push(fixtureCleanupError(`${step.label} cleanup`, error));
      }
    }
  } finally {
    try {
      await disconnect();
    } catch (error) {
      errors.push(fixtureCleanupError("database disconnect", error));
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "PostgreSQL fixture cleanup failed");
  }
}

describe("file access PostgreSQL fixture cleanup", () => {
  it("attempts every cleanup step in order and disconnects after delete failures", async () => {
    const calls: string[] = [];
    const teacherError = new Error("teacher delete failed");
    const reportError = new Error("report delete failed");
    const disconnect = vi.fn(async () => {
      calls.push("disconnect");
    });

    const error = await cleanupPostgresFixture(
      [
        {
          label: "teachers",
          run: async () => {
            calls.push("teachers");
            throw teacherError;
          },
        },
        {
          label: "attachments",
          run: async () => {
            calls.push("attachments");
          },
        },
        {
          label: "report snapshots",
          run: async () => {
            calls.push("report snapshots");
            throw reportError;
          },
        },
      ],
      disconnect,
    ).catch((cleanupError: unknown) => cleanupError);

    expect(calls).toEqual(["teachers", "attachments", "report snapshots", "disconnect"]);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "teachers cleanup failed: teacher delete failed" }),
      expect.objectContaining({ message: "report snapshots cleanup failed: report delete failed" }),
    ]);
    expect((error as AggregateError).errors.map((item) => item.cause)).toEqual([
      teacherError,
      reportError,
    ]);
  });

  it("preserves and reports a disconnect failure after successful deletes", async () => {
    const disconnectError = new Error("disconnect failed");
    const disconnect = vi.fn(async () => {
      throw disconnectError;
    });

    const error = await cleanupPostgresFixture(
      [{ label: "teachers", run: async () => undefined }],
      disconnect,
    ).catch((cleanupError: unknown) => cleanupError);

    expect(disconnect).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "database disconnect failed: disconnect failed" }),
    ]);
    expect((error as AggregateError).errors[0]?.cause).toBe(disconnectError);
  });
});

suite("file access PostgreSQL IDOR relations", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.appUser.createMany({
      data: [
        user(id("admin"), UserRole.ADMIN),
        user(id("fixture-teacher"), UserRole.TEACHER),
        user(id("teacher-direct"), UserRole.TEACHER),
        user(id("teacher-class"), UserRole.TEACHER),
        user(id("teacher-group"), UserRole.TEACHER),
        user(id("teacher-unrelated"), UserRole.TEACHER),
        user(id("student-direct"), UserRole.STUDENT),
        user(id("student-group"), UserRole.STUDENT),
        user(id("student-unrelated"), UserRole.STUDENT),
        user(id("child-direct"), UserRole.STUDENT),
        user(id("child-group"), UserRole.STUDENT),
        user(id("parent-direct"), UserRole.PARENT),
        user(id("parent-group"), UserRole.PARENT),
        user(id("parent-unrelated"), UserRole.PARENT),
      ],
    });

    await prisma.appUser.update({
      where: { id: id("child-direct") },
      data: { parents: { connect: { id: id("parent-direct") } } },
    });
    await prisma.appUser.update({
      where: { id: id("child-group") },
      data: { parents: { connect: { id: id("parent-group") } } },
    });

    await prisma.classGroup.createMany({
      data: [
        {
          id: id("teacher-direct-group"),
          name: "S3 teacher direct group",
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("teacher-class-group"),
          name: "S3 teacher class group",
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("teacher-group-group"),
          name: "S3 teacher group branch",
          teacherId: id("teacher-group"),
        },
        {
          id: id("student-direct-group"),
          name: "S3 student direct group",
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("student-group-group"),
          name: "S3 student group branch",
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("parent-direct-group"),
          name: "S3 parent direct group",
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("parent-group-group"),
          name: "S3 parent group branch",
          teacherId: id("fixture-teacher"),
        },
      ],
    });
    await prisma.classGroup.update({
      where: { id: id("student-group-group") },
      data: { students: { connect: { id: id("student-group") } } },
    });
    await prisma.classGroup.update({
      where: { id: id("parent-group-group") },
      data: { students: { connect: { id: id("child-group") } } },
    });

    const startAt = new Date("2026-07-14T10:00:00.000Z");
    const endAt = new Date("2026-07-14T11:00:00.000Z");
    await prisma.scheduledClass.createMany({
      data: [
        {
          id: id("teacher-direct-class"),
          title: "S3 teacher direct class",
          startAt,
          endAt,
          teacherId: id("fixture-teacher"),
          classGroupId: id("teacher-direct-group"),
        },
        {
          id: id("teacher-class-class"),
          title: "S3 teacher scheduled class",
          startAt,
          endAt,
          teacherId: id("teacher-class"),
          classGroupId: id("teacher-class-group"),
        },
        {
          id: id("teacher-group-class"),
          title: "S3 teacher class group",
          startAt,
          endAt,
          teacherId: id("fixture-teacher"),
          classGroupId: id("teacher-group-group"),
        },
        {
          id: id("student-direct-class"),
          title: "S3 student direct class",
          startAt,
          endAt,
          teacherId: id("fixture-teacher"),
          classGroupId: id("student-direct-group"),
        },
        {
          id: id("student-group-class"),
          title: "S3 student class group",
          startAt,
          endAt,
          teacherId: id("fixture-teacher"),
          classGroupId: id("student-group-group"),
        },
        {
          id: id("parent-direct-class"),
          title: "S3 parent direct class",
          startAt,
          endAt,
          teacherId: id("fixture-teacher"),
          classGroupId: id("parent-direct-group"),
        },
        {
          id: id("parent-group-class"),
          title: "S3 parent class group",
          startAt,
          endAt,
          teacherId: id("fixture-teacher"),
          classGroupId: id("parent-group-group"),
        },
      ],
    });
    await prisma.scheduledClass.update({
      where: { id: id("student-direct-class") },
      data: { students: { connect: { id: id("student-direct") } } },
    });
    await prisma.scheduledClass.update({
      where: { id: id("parent-direct-class") },
      data: { students: { connect: { id: id("child-direct") } } },
    });

    await prisma.courseMaterial.createMany({
      data: [
        {
          id: id("teacher-direct-material"),
          title: "S3 teacher direct material",
          fileUrl: storageUrlForKey(keys.teacherDirect),
          scheduledClassId: id("teacher-direct-class"),
          teacherId: id("teacher-direct"),
        },
        {
          id: id("teacher-class-material"),
          title: "S3 teacher scheduled class material",
          fileUrl: storageUrlForKey(keys.teacherScheduledClass),
          scheduledClassId: id("teacher-class-class"),
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("teacher-group-material"),
          title: "S3 teacher class group material",
          fileUrl: storageUrlForKey(keys.teacherClassGroup),
          scheduledClassId: id("teacher-group-class"),
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("student-direct-material"),
          title: "S3 student direct material",
          fileUrl: storageUrlForKey(keys.studentDirect),
          scheduledClassId: id("student-direct-class"),
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("student-group-material"),
          title: "S3 student class group material",
          fileUrl: storageUrlForKey(keys.studentClassGroup),
          scheduledClassId: id("student-group-class"),
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("parent-direct-material"),
          title: "S3 parent direct material",
          fileUrl: storageUrlForKey(keys.parentDirect),
          scheduledClassId: id("parent-direct-class"),
          teacherId: id("fixture-teacher"),
        },
        {
          id: id("parent-group-material"),
          title: "S3 parent class group material",
          fileUrl: storageUrlForKey(keys.parentClassGroup),
          scheduledClassId: id("parent-group-class"),
          teacherId: id("fixture-teacher"),
        },
      ],
    });

    await prisma.assignment.create({
      data: {
        id: id("assignment"),
        title: "S3 assignment",
        description: "S3",
        dueDate: new Date("2026-07-20T10:00:00.000Z"),
        scheduledClassId: id("parent-direct-class"),
        teacherId: id("teacher-direct"),
      },
    });
    await prisma.submission.create({
      data: {
        id: id("submission"),
        assignmentId: id("assignment"),
        studentId: id("child-direct"),
        contentUrl: storageUrlForKey(keys.submission),
      },
    });

    await prisma.attachment.createMany({
      data: [
        {
          id: id("teacher-direct-attachment"),
          filename: "teacher-direct.pdf",
          storageKey: keys.teacherDirect,
          mimeType: "application/pdf",
          size: 10,
          courseMaterialId: id("teacher-direct-material"),
        },
        {
          id: id("teacher-class-attachment"),
          filename: "teacher-class.pdf",
          storageKey: keys.teacherScheduledClass,
          mimeType: "application/pdf",
          size: 10,
          courseMaterialId: id("teacher-class-material"),
        },
        {
          id: id("teacher-group-attachment"),
          filename: "teacher-group.pdf",
          storageKey: keys.teacherClassGroup,
          mimeType: "application/pdf",
          size: 10,
          courseMaterialId: id("teacher-group-material"),
        },
        {
          id: id("student-direct-attachment"),
          filename: "student-direct.pdf",
          storageKey: keys.studentDirect,
          mimeType: "application/pdf",
          size: 10,
          courseMaterialId: id("student-direct-material"),
        },
        {
          id: id("student-group-attachment"),
          filename: "student-group.pdf",
          storageKey: keys.studentClassGroup,
          mimeType: "application/pdf",
          size: 10,
          courseMaterialId: id("student-group-material"),
        },
        {
          id: id("parent-direct-attachment"),
          filename: "parent-direct.pdf",
          storageKey: keys.parentDirect,
          mimeType: "application/pdf",
          size: 10,
          courseMaterialId: id("parent-direct-material"),
        },
        {
          id: id("parent-group-attachment"),
          filename: "parent-group.pdf",
          storageKey: keys.parentClassGroup,
          mimeType: "application/pdf",
          size: 10,
          courseMaterialId: id("parent-group-material"),
        },
        {
          id: id("submission-attachment"),
          filename: "work.pdf",
          storageKey: keys.submission,
          mimeType: "application/pdf",
          size: 10,
          submissionId: id("submission"),
        },
        {
          id: id("detached-attachment"),
          filename: "detached.pdf",
          storageKey: keys.detachedAttachment,
          mimeType: "application/pdf",
          size: 10,
        },
      ],
    });

    await prisma.academicTerm.create({
      data: {
        id: id("term"),
        name: "S3 term",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-31T23:59:59.000Z"),
      },
    });
    await prisma.reportSnapshot.createMany({
      data: [
        {
          id: id("report"),
          studentId: id("child-direct"),
          classGroupId: id("parent-direct-group"),
          academicTermId: id("term"),
          generatedByTeacherId: id("teacher-direct"),
          snapshotData: {},
          pdfStorageKey: keys.report,
        },
        {
          id: id("null-report"),
          studentId: id("child-direct"),
          classGroupId: id("parent-direct-group"),
          academicTermId: id("term"),
          generatedByTeacherId: id("teacher-direct"),
          snapshotData: {},
          pdfStorageKey: null,
        },
      ],
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
    const fixtureIds = { startsWith: `s3-${runId}-` };
    await cleanupPostgresFixture(
      [
        {
          label: "teachers",
          run: () => prisma.teacher.deleteMany({ where: { id: fixtureIds } }),
        },
        {
          label: "attachments",
          run: () => prisma.attachment.deleteMany({ where: { id: fixtureIds } }),
        },
        {
          label: "report snapshots",
          run: () => prisma.reportSnapshot.deleteMany({ where: { id: fixtureIds } }),
        },
        {
          label: "academic terms",
          run: () => prisma.academicTerm.deleteMany({ where: { id: fixtureIds } }),
        },
        {
          label: "assignments",
          run: () => prisma.assignment.deleteMany({ where: { id: fixtureIds } }),
        },
        {
          label: "course materials",
          run: () => prisma.courseMaterial.deleteMany({ where: { id: fixtureIds } }),
        },
        {
          label: "scheduled classes",
          run: () => prisma.scheduledClass.deleteMany({ where: { id: fixtureIds } }),
        },
        {
          label: "class groups",
          run: () => prisma.classGroup.deleteMany({ where: { id: fixtureIds } }),
        },
        {
          label: "app users",
          run: () => prisma.appUser.deleteMany({ where: { id: fixtureIds } }),
        },
      ],
      () => prisma.$disconnect(),
    );
  }, 60_000);

  it("allows an admin only referenced attachment and report keys", async () => {
    for (const key of [keys.teacherDirect, keys.submission, keys.report, keys.detachedAttachment]) {
      await expect(
        canAccessPrivateStorageKey({ uid: id("admin"), role: UserRole.ADMIN }, key),
      ).resolves.toBe(true);
    }

    for (const key of [keys.nullReportProbe, keys.orphan]) {
      await expect(
        canAccessPrivateStorageKey({ uid: id("admin"), role: UserRole.ADMIN }, key),
      ).resolves.toBe(false);
    }
  });

  it("isolates direct course material teacher ownership", async () => {
    const material = await prisma.courseMaterial.findUniqueOrThrow({
      where: { id: id("teacher-direct-material") },
      select: {
        teacherId: true,
        scheduledClass: {
          select: { teacherId: true, classGroup: { select: { teacherId: true } } },
        },
      },
    });
    expect(material).toEqual({
      teacherId: id("teacher-direct"),
      scheduledClass: {
        teacherId: id("fixture-teacher"),
        classGroup: { teacherId: id("fixture-teacher") },
      },
    });

    await expect(
      canAccessPrivateStorageKey(
        { uid: id("teacher-direct"), role: UserRole.TEACHER },
        keys.teacherDirect,
      ),
    ).resolves.toBe(true);
    for (const teacher of ["teacher-class", "teacher-group", "teacher-unrelated"]) {
      await expect(
        canAccessPrivateStorageKey(
          { uid: id(teacher), role: UserRole.TEACHER },
          keys.teacherDirect,
        ),
      ).resolves.toBe(false);
    }
  });

  it("isolates scheduled class teacher ownership", async () => {
    const material = await prisma.courseMaterial.findUniqueOrThrow({
      where: { id: id("teacher-class-material") },
      select: {
        teacherId: true,
        scheduledClass: {
          select: { teacherId: true, classGroup: { select: { teacherId: true } } },
        },
      },
    });
    expect(material).toEqual({
      teacherId: id("fixture-teacher"),
      scheduledClass: {
        teacherId: id("teacher-class"),
        classGroup: { teacherId: id("fixture-teacher") },
      },
    });

    await expect(
      canAccessPrivateStorageKey(
        { uid: id("teacher-class"), role: UserRole.TEACHER },
        keys.teacherScheduledClass,
      ),
    ).resolves.toBe(true);
    for (const teacher of ["teacher-direct", "teacher-group", "teacher-unrelated"]) {
      await expect(
        canAccessPrivateStorageKey(
          { uid: id(teacher), role: UserRole.TEACHER },
          keys.teacherScheduledClass,
        ),
      ).resolves.toBe(false);
    }
  });

  it("isolates class group teacher ownership", async () => {
    const material = await prisma.courseMaterial.findUniqueOrThrow({
      where: { id: id("teacher-group-material") },
      select: {
        teacherId: true,
        scheduledClass: {
          select: { teacherId: true, classGroup: { select: { teacherId: true } } },
        },
      },
    });
    expect(material).toEqual({
      teacherId: id("fixture-teacher"),
      scheduledClass: {
        teacherId: id("fixture-teacher"),
        classGroup: { teacherId: id("teacher-group") },
      },
    });

    await expect(
      canAccessPrivateStorageKey(
        { uid: id("teacher-group"), role: UserRole.TEACHER },
        keys.teacherClassGroup,
      ),
    ).resolves.toBe(true);
    for (const teacher of ["teacher-direct", "teacher-class", "teacher-unrelated"]) {
      await expect(
        canAccessPrivateStorageKey(
          { uid: id(teacher), role: UserRole.TEACHER },
          keys.teacherClassGroup,
        ),
      ).resolves.toBe(false);
    }
  });

  it("isolates direct scheduled class student membership", async () => {
    const material = await prisma.courseMaterial.findUniqueOrThrow({
      where: { id: id("student-direct-material") },
      select: {
        scheduledClass: {
          select: {
            students: { select: { id: true } },
            classGroup: { select: { students: { select: { id: true } } } },
          },
        },
      },
    });
    expect(material).toEqual({
      scheduledClass: {
        students: [{ id: id("student-direct") }],
        classGroup: { students: [] },
      },
    });

    await expect(
      canAccessPrivateStorageKey(
        { uid: id("student-direct"), role: UserRole.STUDENT },
        keys.studentDirect,
      ),
    ).resolves.toBe(true);
    for (const student of ["student-group", "student-unrelated"]) {
      await expect(
        canAccessPrivateStorageKey(
          { uid: id(student), role: UserRole.STUDENT },
          keys.studentDirect,
        ),
      ).resolves.toBe(false);
    }
  });

  it("isolates class group student membership", async () => {
    const material = await prisma.courseMaterial.findUniqueOrThrow({
      where: { id: id("student-group-material") },
      select: {
        scheduledClass: {
          select: {
            students: { select: { id: true } },
            classGroup: { select: { students: { select: { id: true } } } },
          },
        },
      },
    });
    expect(material).toEqual({
      scheduledClass: {
        students: [],
        classGroup: { students: [{ id: id("student-group") }] },
      },
    });

    await expect(
      canAccessPrivateStorageKey(
        { uid: id("student-group"), role: UserRole.STUDENT },
        keys.studentClassGroup,
      ),
    ).resolves.toBe(true);
    for (const student of ["student-direct", "student-unrelated"]) {
      await expect(
        canAccessPrivateStorageKey(
          { uid: id(student), role: UserRole.STUDENT },
          keys.studentClassGroup,
        ),
      ).resolves.toBe(false);
    }
  });

  it("isolates a linked child with direct scheduled class membership", async () => {
    const material = await prisma.courseMaterial.findUniqueOrThrow({
      where: { id: id("parent-direct-material") },
      select: {
        scheduledClass: {
          select: {
            students: {
              select: { id: true, parents: { select: { id: true } } },
            },
            classGroup: {
              select: {
                students: {
                  select: { id: true, parents: { select: { id: true } } },
                },
              },
            },
          },
        },
      },
    });
    expect(material).toEqual({
      scheduledClass: {
        students: [{ id: id("child-direct"), parents: [{ id: id("parent-direct") }] }],
        classGroup: { students: [] },
      },
    });

    await expect(
      canAccessPrivateStorageKey(
        { uid: id("parent-direct"), role: UserRole.PARENT },
        keys.parentDirect,
      ),
    ).resolves.toBe(true);
    for (const parent of ["parent-group", "parent-unrelated"]) {
      await expect(
        canAccessPrivateStorageKey({ uid: id(parent), role: UserRole.PARENT }, keys.parentDirect),
      ).resolves.toBe(false);
    }
  });

  it("isolates a linked child with class group membership", async () => {
    const material = await prisma.courseMaterial.findUniqueOrThrow({
      where: { id: id("parent-group-material") },
      select: {
        scheduledClass: {
          select: {
            students: {
              select: { id: true, parents: { select: { id: true } } },
            },
            classGroup: {
              select: {
                students: {
                  select: { id: true, parents: { select: { id: true } } },
                },
              },
            },
          },
        },
      },
    });
    expect(material).toEqual({
      scheduledClass: {
        students: [],
        classGroup: {
          students: [{ id: id("child-group"), parents: [{ id: id("parent-group") }] }],
        },
      },
    });

    await expect(
      canAccessPrivateStorageKey(
        { uid: id("parent-group"), role: UserRole.PARENT },
        keys.parentClassGroup,
      ),
    ).resolves.toBe(true);
    for (const parent of ["parent-direct", "parent-unrelated"]) {
      await expect(
        canAccessPrivateStorageKey(
          { uid: id(parent), role: UserRole.PARENT },
          keys.parentClassGroup,
        ),
      ).resolves.toBe(false);
    }
  });

  it("keeps submission and report access scoped to their exact actors", async () => {
    for (const key of [keys.submission, keys.report]) {
      await expect(
        canAccessPrivateStorageKey({ uid: id("teacher-direct"), role: UserRole.TEACHER }, key),
      ).resolves.toBe(true);
      await expect(
        canAccessPrivateStorageKey({ uid: id("child-direct"), role: UserRole.STUDENT }, key),
      ).resolves.toBe(true);
      await expect(
        canAccessPrivateStorageKey({ uid: id("parent-direct"), role: UserRole.PARENT }, key),
      ).resolves.toBe(true);

      await expect(
        canAccessPrivateStorageKey({ uid: id("teacher-class"), role: UserRole.TEACHER }, key),
      ).resolves.toBe(false);
      await expect(
        canAccessPrivateStorageKey({ uid: id("student-unrelated"), role: UserRole.STUDENT }, key),
      ).resolves.toBe(false);
      await expect(
        canAccessPrivateStorageKey({ uid: id("parent-group"), role: UserRole.PARENT }, key),
      ).resolves.toBe(false);
    }
  });

  it("denies nullable attachment relations, null report keys, and unrelated actors", async () => {
    const detachedAttachment = await prisma.attachment.findUniqueOrThrow({
      where: { id: id("detached-attachment") },
      select: { courseMaterialId: true, submissionId: true },
    });
    expect(detachedAttachment).toEqual({ courseMaterialId: null, submissionId: null });

    const nullReport = await prisma.reportSnapshot.findUniqueOrThrow({
      where: { id: id("null-report") },
      select: { pdfStorageKey: true },
    });
    expect(nullReport).toEqual({ pdfStorageKey: null });

    for (const key of [keys.detachedAttachment, keys.nullReportProbe, keys.orphan]) {
      await expect(
        canAccessPrivateStorageKey({ uid: id("teacher-unrelated"), role: UserRole.TEACHER }, key),
      ).resolves.toBe(false);
      await expect(
        canAccessPrivateStorageKey({ uid: id("student-unrelated"), role: UserRole.STUDENT }, key),
      ).resolves.toBe(false);
      await expect(
        canAccessPrivateStorageKey({ uid: id("parent-unrelated"), role: UserRole.PARENT }, key),
      ).resolves.toBe(false);
    }
  });

  it("publishes only the exact active teacher photo application URL", async () => {
    await expect(isPublishedTeacherPhoto(keys.photo)).resolves.toBe(true);
    await expect(isPublishedTeacherPhoto(keys.inactivePhoto)).resolves.toBe(false);
    await expect(isPublishedTeacherPhoto(keys.externalPhoto)).resolves.toBe(false);
    await expect(isPublishedTeacherPhoto(keys.teacherDirect)).resolves.toBe(false);
  });
});
