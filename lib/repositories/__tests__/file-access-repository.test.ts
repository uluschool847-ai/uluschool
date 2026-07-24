import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canAccessPrivateStorageKey,
  isPublishedTeacherPhoto,
} from "@/lib/repositories/file-access-repository";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const privateKey = "private/teachers/teacher-1/materials/lesson.pdf";
const reportKey = "private/teachers/teacher-1/reports/report.pdf";
const publicPhotoKey = "public/teachers/admin-1/photo.webp";

function session(uid: string, role: UserRole) {
  return { uid, role };
}

function createDatabase() {
  return {
    attachment: { findFirst: vi.fn() },
    reportSnapshot: { findFirst: vi.fn() },
    teacher: { findFirst: vi.fn() },
  };
}

type TestDatabase = ReturnType<typeof createDatabase>;

function asDatabase(database: TestDatabase) {
  return database as never;
}

describe("private file access repository", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createDatabase();
    database.attachment.findFirst.mockResolvedValue(null);
    database.reportSnapshot.findFirst.mockResolvedValue(null);
    database.teacher.findFirst.mockResolvedValue(null);
  });

  it.each([
    "public/teachers/admin-1/photo.webp",
    "uploads/legacy.pdf",
    "private/teachers/teacher-1/materials/../teacher-2/file.pdf",
    "private\\teachers\\teacher-1\\materials\\file.pdf",
  ])("rejects a malformed or non-private key before database work: %s", async (storageKey) => {
    await expect(
      canAccessPrivateStorageKey(
        session("admin-1", UserRole.ADMIN),
        storageKey,
        asDatabase(database),
      ),
    ).resolves.toBe(false);

    expect(database.attachment.findFirst).not.toHaveBeenCalled();
    expect(database.reportSnapshot.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    { uid: "", role: UserRole.ADMIN },
    { uid: " admin-1", role: UserRole.ADMIN },
    { uid: "admin-1", role: "OWNER" },
    { uid: 42, role: UserRole.ADMIN },
  ])("defaults denied malformed session identity before database work", async (malformed) => {
    await expect(
      canAccessPrivateStorageKey(malformed as never, privateKey, asDatabase(database)),
    ).resolves.toBe(false);

    expect(database.attachment.findFirst).not.toHaveBeenCalled();
    expect(database.reportSnapshot.findFirst).not.toHaveBeenCalled();
  });

  it("allows an admin only when an attachment references the key", async () => {
    database.attachment.findFirst.mockResolvedValueOnce({ id: "attachment-1" });

    await expect(
      canAccessPrivateStorageKey(
        session("admin-1", UserRole.ADMIN),
        privateKey,
        asDatabase(database),
      ),
    ).resolves.toBe(true);

    expect(database.attachment.findFirst).toHaveBeenCalledWith({
      where: { storageKey: privateKey },
      select: { id: true },
    });
    expect(database.reportSnapshot.findFirst).not.toHaveBeenCalled();
  });

  it("allows an admin when a report snapshot references the key", async () => {
    database.reportSnapshot.findFirst.mockResolvedValueOnce({ id: "report-1" });

    await expect(
      canAccessPrivateStorageKey(
        session("admin-1", UserRole.ADMIN),
        reportKey,
        asDatabase(database),
      ),
    ).resolves.toBe(true);

    expect(database.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: reportKey },
      select: { id: true },
    });
  });

  it("denies an admin an unreferenced private bucket object", async () => {
    await expect(
      canAccessPrivateStorageKey(
        session("admin-1", UserRole.ADMIN),
        privateKey,
        asDatabase(database),
      ),
    ).resolves.toBe(false);

    expect(database.attachment.findFirst).toHaveBeenCalledTimes(1);
    expect(database.reportSnapshot.findFirst).toHaveBeenCalledTimes(1);
  });

  it("allows a teacher an attachment owned directly or through a scheduled class or class group", async () => {
    database.attachment.findFirst.mockResolvedValueOnce({ id: "attachment-1" });

    await expect(
      canAccessPrivateStorageKey(
        session("teacher-1", UserRole.TEACHER),
        privateKey,
        asDatabase(database),
      ),
    ).resolves.toBe(true);

    const teacherOwnership = [
      { teacherId: "teacher-1" },
      { scheduledClass: { is: { teacherId: "teacher-1" } } },
      {
        scheduledClass: {
          is: { classGroup: { is: { teacherId: "teacher-1" } } },
        },
      },
    ];
    expect(database.attachment.findFirst).toHaveBeenCalledWith({
      where: {
        storageKey: privateKey,
        OR: [
          { courseMaterial: { is: { OR: teacherOwnership } } },
          {
            submission: {
              is: { assignment: { is: { OR: teacherOwnership } } },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it("denies a teacher another teacher's attachment", async () => {
    await expect(
      canAccessPrivateStorageKey(
        session("teacher-2", UserRole.TEACHER),
        privateKey,
        asDatabase(database),
      ),
    ).resolves.toBe(false);

    expect(database.attachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storageKey: privateKey }),
      }),
    );
    expect(database.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: privateKey, generatedByTeacherId: "teacher-2" },
      select: { id: true },
    });
  });

  it("allows a teacher only a report they generated", async () => {
    database.reportSnapshot.findFirst.mockResolvedValueOnce({ id: "report-1" });

    await expect(
      canAccessPrivateStorageKey(
        session("teacher-1", UserRole.TEACHER),
        reportKey,
        asDatabase(database),
      ),
    ).resolves.toBe(true);

    expect(database.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: reportKey, generatedByTeacherId: "teacher-1" },
      select: { id: true },
    });
  });

  it("allows a student their submission or material from an enrolled class", async () => {
    database.attachment.findFirst.mockResolvedValueOnce({ id: "attachment-1" });

    await expect(
      canAccessPrivateStorageKey(
        session("student-1", UserRole.STUDENT),
        privateKey,
        asDatabase(database),
      ),
    ).resolves.toBe(true);

    expect(database.attachment.findFirst).toHaveBeenCalledWith({
      where: {
        storageKey: privateKey,
        OR: [
          { submission: { is: { studentId: "student-1" } } },
          {
            courseMaterial: {
              is: {
                scheduledClass: {
                  is: {
                    OR: [
                      { students: { some: { id: "student-1" } } },
                      {
                        classGroup: {
                          is: { students: { some: { id: "student-1" } } },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it("denies a student another student's submission and unrelated class material", async () => {
    await expect(
      canAccessPrivateStorageKey(
        session("student-2", UserRole.STUDENT),
        privateKey,
        asDatabase(database),
      ),
    ).resolves.toBe(false);

    expect(database.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: privateKey, studentId: "student-2" },
      select: { id: true },
    });
  });

  it("allows a student only their own report", async () => {
    database.reportSnapshot.findFirst.mockResolvedValueOnce({ id: "report-1" });

    await expect(
      canAccessPrivateStorageKey(
        session("student-1", UserRole.STUDENT),
        reportKey,
        asDatabase(database),
      ),
    ).resolves.toBe(true);

    expect(database.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: reportKey, studentId: "student-1" },
      select: { id: true },
    });
  });

  it("allows a parent only a linked child's submission or class material", async () => {
    database.attachment.findFirst.mockResolvedValueOnce({ id: "attachment-1" });

    await expect(
      canAccessPrivateStorageKey(
        session("parent-1", UserRole.PARENT),
        privateKey,
        asDatabase(database),
      ),
    ).resolves.toBe(true);

    const linkedChild = { parents: { some: { id: "parent-1" } } };
    expect(database.attachment.findFirst).toHaveBeenCalledWith({
      where: {
        storageKey: privateKey,
        OR: [
          { submission: { is: { student: { is: linkedChild } } } },
          {
            courseMaterial: {
              is: {
                scheduledClass: {
                  is: {
                    OR: [
                      { students: { some: linkedChild } },
                      {
                        classGroup: {
                          is: { students: { some: linkedChild } },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it("denies a parent an unlinked child's attachment", async () => {
    await expect(
      canAccessPrivateStorageKey(
        session("parent-2", UserRole.PARENT),
        privateKey,
        asDatabase(database),
      ),
    ).resolves.toBe(false);

    expect(database.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        pdfStorageKey: privateKey,
        student: { is: { parents: { some: { id: "parent-2" } } } },
      },
      select: { id: true },
    });
  });

  it("allows a parent only a linked child's report", async () => {
    database.reportSnapshot.findFirst.mockResolvedValueOnce({ id: "report-1" });

    await expect(
      canAccessPrivateStorageKey(
        session("parent-1", UserRole.PARENT),
        reportKey,
        asDatabase(database),
      ),
    ).resolves.toBe(true);

    expect(database.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        pdfStorageKey: reportKey,
        student: { is: { parents: { some: { id: "parent-1" } } } },
      },
      select: { id: true },
    });
  });
});

describe("published teacher photo access repository", () => {
  it.each([
    "private/teachers/admin-1/photo.webp",
    "uploads/legacy-photo.webp",
    "public/teachers/admin-1/../admin-2/photo.webp",
  ])("rejects malformed or non-public keys before database work: %s", async (storageKey) => {
    const database = createDatabase();

    await expect(isPublishedTeacherPhoto(storageKey, asDatabase(database))).resolves.toBe(false);

    expect(database.teacher.findFirst).not.toHaveBeenCalled();
  });

  it("requires an active teacher whose photo URL exactly matches the application storage URL", async () => {
    const database = createDatabase();
    database.teacher.findFirst.mockResolvedValueOnce({ id: "teacher-profile-1" });

    await expect(isPublishedTeacherPhoto(publicPhotoKey, asDatabase(database))).resolves.toBe(true);

    expect(database.teacher.findFirst).toHaveBeenCalledWith({
      where: {
        isActive: true,
        photoUrl: storageUrlForKey(publicPhotoKey),
      },
      select: { id: true },
    });
  });

  it("denies inactive, unreferenced, legacy, or external teacher photo URLs", async () => {
    const database = createDatabase();
    database.teacher.findFirst.mockResolvedValueOnce(null);

    await expect(isPublishedTeacherPhoto(publicPhotoKey, asDatabase(database))).resolves.toBe(
      false,
    );

    const query = database.teacher.findFirst.mock.calls[0]?.[0];
    expect(query.where.photoUrl).not.toMatch(/^https?:/);
    expect(query.where.photoUrl).not.toMatch(/^\/uploads\//);
  });
});
