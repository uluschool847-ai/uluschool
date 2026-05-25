import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  adminAuditLog: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type TeacherActivityLogRepositoryModule = {
  listTeacherActivityLog: (
    teacherId: string,
    filters?: Record<string, string | undefined>,
  ) => Promise<Array<Record<string, unknown>>>;
};

function loadTeacherActivityLogRepository() {
  const specifier = "@/lib/repositories/teacher-activity-log-repository";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherActivityLogRepositoryModule>;
}

function auditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-1",
    action: "ATTENDANCE_MARKED",
    actorId: "teacher-1",
    actorEmail: "teacher@example.com",
    actorFullName: "Teacher One",
    actorRole: "TEACHER",
    before: { status: null, internalNote: "raw-before-secret" },
    after: { status: "PRESENT", internalNote: "raw-after-secret" },
    meta: {
      teacherId: "teacher-1",
      studentId: "student-1",
      studentName: "Amina Yusuf",
      classGroupId: "group-1",
      classGroupName: "Algebra Group A",
      scheduledClassId: "lesson-1",
      lessonTitle: "Quadratics",
      reason: "Late arrival noted",
    },
    targetId: "attendance-1",
    targetType: "attendance",
    createdAt: new Date("2026-05-20T10:00:00.000Z"),
    ...overrides,
  };
}

describe("teacher-activity-log repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.adminAuditLog.findMany.mockResolvedValue([auditLog()]);
  });

  it("exports the teacher activity log API", async () => {
    const repository = await loadTeacherActivityLogRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        listTeacherActivityLog: expect.any(Function),
      }),
    );
  });

  it("scopes activity to the current teacher and supported attendance/manual-grade actions", async () => {
    const { listTeacherActivityLog } = await loadTeacherActivityLogRepository();
    await listTeacherActivityLog("teacher-1");

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        where: expect.objectContaining({
          actorId: "teacher-1",
          action: {
            in: [
              "ATTENDANCE_MARKED",
              "ATTENDANCE_UPDATED",
              "MANUAL_GRADE_CREATED",
              "MANUAL_GRADE_UPDATED",
              "MANUAL_GRADE_ARCHIVED",
            ],
          },
        }),
      }),
    );
  });

  it("applies filters inside teacher scope for action, student, class group, and date range", async () => {
    const { listTeacherActivityLog } = await loadTeacherActivityLogRepository();
    await listTeacherActivityLog("teacher-1", {
      action: "ATTENDANCE_UPDATED",
      classGroupId: "group-1",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      studentId: "student-1",
    });

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: "teacher-1",
          action: "ATTENDANCE_UPDATED",
          createdAt: {
            gte: new Date("2026-05-01T00:00:00.000Z"),
            lte: new Date("2026-05-31T23:59:59.999Z"),
          },
          AND: expect.arrayContaining([
            expect.objectContaining({ meta: { path: ["studentId"], equals: "student-1" } }),
            expect.objectContaining({ meta: { path: ["classGroupId"], equals: "group-1" } }),
          ]),
        }),
      }),
    );
  });

  it("does not allow invalid action filters to widen beyond supported teacher activity", async () => {
    const { listTeacherActivityLog } = await loadTeacherActivityLogRepository();
    await listTeacherActivityLog("teacher-1", { action: "STUDENT_PROFILE_UPDATED" });

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: "teacher-1",
          action: {
            in: [
              "ATTENDANCE_MARKED",
              "ATTENDANCE_UPDATED",
              "MANUAL_GRADE_CREATED",
              "MANUAL_GRADE_UPDATED",
              "MANUAL_GRADE_ARCHIVED",
            ],
          },
        }),
      }),
    );
  });

  it("returns only safe projected fields and omits raw admin audit JSON", async () => {
    const { listTeacherActivityLog } = await loadTeacherActivityLogRepository();
    const rows = await listTeacherActivityLog("teacher-1");

    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: "audit-1",
        action: "ATTENDANCE_MARKED",
        label: expect.stringMatching(/attendance/i),
        studentName: "Amina Yusuf",
        classGroupName: "Algebra Group A",
        lessonTitle: "Quadratics",
        reason: "Late arrival noted",
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
      }),
    );
    expect(rows[0]).not.toHaveProperty("before");
    expect(rows[0]).not.toHaveProperty("after");
    expect(rows[0]).not.toHaveProperty("meta");
    expect(rows[0]).not.toHaveProperty("actorEmail");
    expect(JSON.stringify(rows[0])).not.toContain("raw-before-secret");
    expect(JSON.stringify(rows[0])).not.toContain("raw-after-secret");
  });

  it("does not return other-teacher or admin-only rows even when raw data contains them", async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValueOnce([
      auditLog({ id: "mine", actorId: "teacher-1", action: "MANUAL_GRADE_CREATED" }),
    ]);

    const { listTeacherActivityLog } = await loadTeacherActivityLogRepository();
    const rows = await listTeacherActivityLog("teacher-1", {
      action: "MANUAL_GRADE_CREATED",
      teacherId: "teacher-2",
    });

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: "teacher-1",
          action: "MANUAL_GRADE_CREATED",
        }),
      }),
    );
    expect(JSON.stringify(rows)).not.toContain("teacher-2");
    expect(JSON.stringify(rows)).not.toContain("STUDENT_PROFILE_UPDATED");
  });
});
