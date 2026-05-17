import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createClassGroupMock = vi.hoisted(() => vi.fn());
const updateClassGroupMock = vi.hoisted(() => vi.fn());
const setClassGroupStatusMock = vi.hoisted(() => vi.fn());
const deleteClassGroupMock = vi.hoisted(() => vi.fn());
const enrollStudentToClassGroupMock = vi.hoisted(() => vi.fn());
const unenrollStudentFromClassGroupMock = vi.hoisted(() => vi.fn());
const getClassGroupByIdMock = vi.hoisted(() => vi.fn());
const createScheduledClassMock = vi.hoisted(() => vi.fn());
const updateScheduledClassMock = vi.hoisted(() => vi.fn());
const deleteScheduledClassMock = vi.hoisted(() => vi.fn());
const updateGroupLessonsTeacherMock = vi.hoisted(() => vi.fn());
const transactionClientMock = vi.hoisted(() => ({
  tx: true,
  scheduledClass: {
    updateMany: updateGroupLessonsTeacherMock,
  },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof transactionClientMock) => unknown) =>
    callback(transactionClientMock),
  ),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/repositories/class-group-repository", () => ({
  createClassGroup: createClassGroupMock,
  deleteClassGroup: deleteClassGroupMock,
  enrollStudentToClassGroup: enrollStudentToClassGroupMock,
  getClassGroupById: getClassGroupByIdMock,
  setClassGroupStatus: setClassGroupStatusMock,
  unenrollStudentFromClassGroup: unenrollStudentFromClassGroupMock,
  updateClassGroup: updateClassGroupMock,
}));

vi.mock("@/lib/repositories/schedule-repository", () => ({
  createScheduledClass: createScheduledClassMock,
  deleteScheduledClass: deleteScheduledClassMock,
  updateScheduledClass: updateScheduledClassMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type ActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

type ClassGroupActionsModule = {
  createClassGroupAction: (formData: FormData) => Promise<ActionResult>;
  updateClassGroupAction: (formData: FormData) => Promise<ActionResult>;
  updateClassGroupStatusAction: (formData: FormData) => Promise<ActionResult>;
  deleteClassGroupAction: (formData: FormData) => Promise<ActionResult>;
  enrollStudentToClassGroupAction: (formData: FormData) => Promise<ActionResult>;
  unenrollStudentFromClassGroupAction: (formData: FormData) => Promise<ActionResult>;
  createClassGroupLessonAction: (formData: FormData) => Promise<ActionResult>;
  updateClassGroupLessonAction: (formData: FormData) => Promise<ActionResult>;
  deleteClassGroupLessonAction?: (formData: FormData) => Promise<ActionResult>;
  cancelClassGroupLessonAction?: (formData: FormData) => Promise<ActionResult>;
};

async function loadClassGroupActions() {
  const specifier = "@/app/(admin)/admin/classes/actions";
  return import(/* @vite-ignore */ specifier) as Promise<ClassGroupActionsModule>;
}

function validGroupForm(overrides?: Partial<Record<string, string | number | null>>) {
  const formData = new FormData();
  formData.set("id", "group-1");
  formData.set("name", "IGCSE Mathematics Group A");
  formData.set("description", "Core IGCSE mathematics group");
  formData.set("subjectId", "subject-math");
  formData.set("levelId", "level-igcse");
  formData.set("teacherId", "teacher-1");
  formData.set("status", "ACTIVE");
  formData.set("capacity", "8");
  formData.set("startDate", "2026-06-01");
  formData.set("endDate", "2026-12-15");

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === null) {
      formData.delete(key);
    } else {
      formData.set(key, String(value));
    }
  }

  return formData;
}

function enrollmentForm(overrides?: Partial<Record<string, string>>) {
  const formData = new FormData();
  formData.set("classGroupId", "group-1");
  formData.set("studentId", "student-1");
  for (const [key, value] of Object.entries(overrides ?? {})) {
    formData.set(key, value);
  }
  return formData;
}

function lessonForm(overrides?: Partial<Record<string, string | null>>) {
  const formData = new FormData();
  formData.set("classGroupId", "group-1");
  formData.set("lessonId", "lesson-1");
  formData.set("title", "Quadratic functions");
  formData.set("description", "Lesson on quadratic functions");
  formData.set("startAt", "2026-06-01T10:00");
  formData.set("endAt", "2026-06-01T11:00");
  formData.set("liveLessonUrl", "https://meet.example.com/quadratics");

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === null) {
      formData.delete(key);
    } else {
      formData.set(key, value);
    }
  }

  return formData;
}

function groupRecord(overrides?: Record<string, unknown>) {
  return {
    id: "group-1",
    name: "IGCSE Mathematics Group A",
    description: "Core IGCSE mathematics group",
    subjectId: "subject-math",
    levelId: "level-igcse",
    teacherId: "teacher-1",
    status: "ACTIVE",
    capacity: 8,
    startDate: new Date("2026-06-01T00:00:00.000Z"),
    endDate: new Date("2026-12-15T00:00:00.000Z"),
    createdAt: new Date("2026-05-01T09:00:00.000Z"),
    updatedAt: new Date("2026-05-10T09:00:00.000Z"),
    ...overrides,
  };
}

function lessonRecord(overrides?: Record<string, unknown>) {
  return {
    id: "lesson-1",
    title: "Quadratic functions",
    description: "Lesson on quadratic functions",
    classGroupId: "group-1",
    startAt: new Date("2026-06-01T10:00:00.000Z"),
    endAt: new Date("2026-06-01T11:00:00.000Z"),
    liveLessonUrl: "https://meet.example.com/quadratics",
    teacherId: "teacher-1",
    subjectId: "subject-math",
    ...overrides,
  };
}

function auditPayloadFor(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action)?.[0];
}

function expectClassGroupRevalidation(groupId = "group-1") {
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/classes");
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/classes/${groupId}`);
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/classes/${groupId}/edit`);
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/schedule");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
}

function expectClassGroupAuditTarget(action: string, meta?: Record<string, unknown>) {
  expect(auditPayloadFor(action)).toEqual(
    expect.objectContaining({
      adminUserId: "admin-1",
      action,
      targetType: "class_group",
      targetId: "group-1",
      meta: expect.objectContaining({
        classGroupId: "group-1",
        ...meta,
      }),
    }),
  );
}

function getDeleteOrCancelLessonAction(actions: ClassGroupActionsModule) {
  const action = actions.deleteClassGroupLessonAction ?? actions.cancelClassGroupLessonAction;
  if (!action) {
    throw new Error("Expected deleteClassGroupLessonAction or cancelClassGroupLessonAction.");
  }
  return action;
}

describe("Admin class group actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transactionClientMock) => unknown) =>
        callback(transactionClientMock),
    );
  });

  it("requires ADMIN before class group, enrollment, and lesson mutations", async () => {
    const actions = await loadClassGroupActions();

    for (const action of [
      actions.createClassGroupAction,
      actions.updateClassGroupAction,
      actions.updateClassGroupStatusAction,
      actions.deleteClassGroupAction,
      actions.enrollStudentToClassGroupAction,
      actions.unenrollStudentFromClassGroupAction,
      actions.createClassGroupLessonAction,
      actions.updateClassGroupLessonAction,
      getDeleteOrCancelLessonAction(actions),
    ]) {
      vi.clearAllMocks();
      requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

      const result = await action(validGroupForm());

      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/unauthorized|failed/i),
        }),
      );
    }

    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(createClassGroupMock).not.toHaveBeenCalled();
    expect(updateClassGroupMock).not.toHaveBeenCalled();
    expect(setClassGroupStatusMock).not.toHaveBeenCalled();
    expect(deleteClassGroupMock).not.toHaveBeenCalled();
    expect(enrollStudentToClassGroupMock).not.toHaveBeenCalled();
    expect(unenrollStudentFromClassGroupMock).not.toHaveBeenCalled();
    expect(createScheduledClassMock).not.toHaveBeenCalled();
    expect(updateScheduledClassMock).not.toHaveBeenCalled();
    expect(deleteScheduledClassMock).not.toHaveBeenCalled();
  });

  it.each([
    { field: "name", value: "", errorKey: "name", pattern: /required/i },
    { field: "status", value: "OPEN", errorKey: "status", pattern: /status|invalid/i },
    { field: "capacity", value: "many", errorKey: "capacity", pattern: /number|numeric/i },
    { field: "capacity", value: "-1", errorKey: "capacity", pattern: /non-negative|positive/i },
  ])(
    "returns class group validation errors for invalid $field",
    async ({ field, value, errorKey, pattern }) => {
      const { createClassGroupAction } = await loadClassGroupActions();

      const result = await createClassGroupAction(validGroupForm({ [field]: value }));

      expect(result).toEqual({
        success: false,
        errors: {
          [errorKey]: expect.arrayContaining([expect.stringMatching(pattern)]),
        },
      });
      expect(createClassGroupMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["teacherId", "Teacher must exist and be a TEACHER"],
    ["subjectId", "Subject must exist"],
    ["levelId", "Level must exist"],
  ])("surfaces selected %s validation failures without audit", async (field, message) => {
    createClassGroupMock.mockRejectedValueOnce(new Error(message));

    const { createClassGroupAction } = await loadClassGroupActions();
    const result = await createClassGroupAction(validGroupForm({ [field]: `missing-${field}` }));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/teacher|subject|level/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("creates a class group with transaction-safe CLASS_GROUP_CREATED audit and visible success", async () => {
    createClassGroupMock.mockResolvedValueOnce(groupRecord());

    const { createClassGroupAction } = await loadClassGroupActions();
    const result = await createClassGroupAction(validGroupForm());

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(createClassGroupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "IGCSE Mathematics Group A",
        subjectId: "subject-math",
        levelId: "level-igcse",
        teacherId: "teacher-1",
        status: "ACTIVE",
        capacity: 8,
      }),
      transactionClientMock,
    );
    expectClassGroupAuditTarget("CLASS_GROUP_CREATED", { teacherId: "teacher-1" });
    expect(auditPayloadFor("CLASS_GROUP_CREATED")).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({
          id: "group-1",
          name: "IGCSE Mathematics Group A",
          teacherId: "teacher-1",
        }),
      }),
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(expect.any(Object), transactionClientMock);
    expectClassGroupRevalidation();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/class group.*created/i),
      }),
    );
  });

  it("updates a class group with meaningful before/after audit values", async () => {
    updateClassGroupMock.mockResolvedValueOnce({
      before: groupRecord({ name: "Old Group", teacherId: "teacher-old", capacity: 6 }),
      after: groupRecord({ name: "Updated Group", teacherId: "teacher-2", capacity: 10 }),
    });

    const { updateClassGroupAction } = await loadClassGroupActions();
    const result = await updateClassGroupAction(
      validGroupForm({ name: "Updated Group", teacherId: "teacher-2", capacity: "10" }),
    );

    expect(updateClassGroupMock).toHaveBeenCalledWith(
      "group-1",
      expect.objectContaining({
        name: "Updated Group",
        teacherId: "teacher-2",
        capacity: 10,
      }),
      transactionClientMock,
    );
    expectClassGroupAuditTarget("CLASS_GROUP_UPDATED", { teacherId: "teacher-2" });
    expect(auditPayloadFor("CLASS_GROUP_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          id: "group-1",
          name: "Old Group",
          teacherId: "teacher-old",
          capacity: 6,
        }),
        after: expect.objectContaining({
          id: "group-1",
          name: "Updated Group",
          teacherId: "teacher-2",
          capacity: 10,
        }),
      }),
    );
    expect(auditPayloadFor("CLASS_GROUP_UPDATED")?.before).not.toEqual({ id: "group-1" });
    expectClassGroupRevalidation();
    expect(result.success).toBe(true);
  });

  it("writes CLASS_GROUP_TEACHER_UPDATED when the assigned teacher changes", async () => {
    updateClassGroupMock.mockResolvedValueOnce({
      before: groupRecord({ teacherId: "teacher-old" }),
      after: groupRecord({ teacherId: "teacher-2" }),
    });

    const { updateClassGroupAction } = await loadClassGroupActions();
    await updateClassGroupAction(validGroupForm({ teacherId: "teacher-2" }));

    expect(updateGroupLessonsTeacherMock).toHaveBeenCalledWith({
      where: { classGroupId: "group-1", teacherId: "teacher-old" },
      data: { teacherId: "teacher-2" },
    });
    expectClassGroupAuditTarget("CLASS_GROUP_TEACHER_UPDATED", { teacherId: "teacher-2" });
    expect(auditPayloadFor("CLASS_GROUP_TEACHER_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ teacherId: "teacher-old" }),
        after: expect.objectContaining({ teacherId: "teacher-2" }),
      }),
    );
  });

  it("updates class group status with meaningful before/after audit values", async () => {
    setClassGroupStatusMock.mockResolvedValueOnce({
      before: groupRecord({ status: "ACTIVE" }),
      after: groupRecord({ status: "PAUSED" }),
    });

    const { updateClassGroupStatusAction } = await loadClassGroupActions();
    const result = await updateClassGroupStatusAction(validGroupForm({ status: "PAUSED" }));

    expect(setClassGroupStatusMock).toHaveBeenCalledWith(
      "group-1",
      "PAUSED",
      transactionClientMock,
    );
    expectClassGroupAuditTarget("CLASS_GROUP_STATUS_UPDATED");
    expect(auditPayloadFor("CLASS_GROUP_STATUS_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "group-1", status: "ACTIVE" }),
        after: expect.objectContaining({ id: "group-1", status: "PAUSED" }),
      }),
    );
    expectClassGroupRevalidation();
    expect(result.success).toBe(true);
  });

  it("deletes a dependency-free class group with audit before/after values", async () => {
    deleteClassGroupMock.mockResolvedValueOnce(groupRecord());

    const { deleteClassGroupAction } = await loadClassGroupActions();
    const result = await deleteClassGroupAction(validGroupForm());

    expect(deleteClassGroupMock).toHaveBeenCalledWith("group-1", transactionClientMock);
    expectClassGroupAuditTarget("CLASS_GROUP_DELETED");
    expect(auditPayloadFor("CLASS_GROUP_DELETED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "group-1", name: "IGCSE Mathematics Group A" }),
        after: expect.objectContaining({ deleted: true }),
      }),
    );
    expectClassGroupRevalidation();
    expect(result.success).toBe(true);
  });

  it("blocks class group delete with dependencies and does not audit", async () => {
    deleteClassGroupMock.mockRejectedValueOnce(
      new Error("Class group has dependencies and cannot be deleted safely."),
    );

    const { deleteClassGroupAction } = await loadClassGroupActions();
    const result = await deleteClassGroupAction(validGroupForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/dependencies|cannot be deleted/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each([
    ["student must exist and be STUDENT", "Selected user must be a STUDENT."],
    ["duplicate group enrollment", "Student is already enrolled in this class group."],
    ["capacity exceeded", "Class group capacity has been reached."],
  ])("blocks enrollment when %s", async (_label, message) => {
    enrollStudentToClassGroupMock.mockRejectedValueOnce(new Error(message));

    const { enrollStudentToClassGroupAction } = await loadClassGroupActions();
    const result = await enrollStudentToClassGroupAction(enrollmentForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/student|already enrolled|capacity/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("enrolls a student with CLASS_GROUP_STUDENT_ENROLLED audit metadata", async () => {
    enrollStudentToClassGroupMock.mockResolvedValueOnce(groupRecord({ studentsCount: 4 }));

    const { enrollStudentToClassGroupAction } = await loadClassGroupActions();
    const result = await enrollStudentToClassGroupAction(enrollmentForm());

    expect(enrollStudentToClassGroupMock).toHaveBeenCalledWith(
      "group-1",
      "student-1",
      transactionClientMock,
    );
    expectClassGroupAuditTarget("CLASS_GROUP_STUDENT_ENROLLED", { studentId: "student-1" });
    expect(auditPayloadFor("CLASS_GROUP_STUDENT_ENROLLED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ studentId: "student-1", enrolled: false }),
        after: expect.objectContaining({ studentId: "student-1", enrolled: true }),
      }),
    );
    expectClassGroupRevalidation();
    expect(result.success).toBe(true);
  });

  it("unenrolls a student with CLASS_GROUP_STUDENT_UNENROLLED audit metadata", async () => {
    unenrollStudentFromClassGroupMock.mockResolvedValueOnce(groupRecord({ studentsCount: 3 }));

    const { unenrollStudentFromClassGroupAction } = await loadClassGroupActions();
    const result = await unenrollStudentFromClassGroupAction(enrollmentForm());

    expect(unenrollStudentFromClassGroupMock).toHaveBeenCalledWith(
      "group-1",
      "student-1",
      transactionClientMock,
    );
    expectClassGroupAuditTarget("CLASS_GROUP_STUDENT_UNENROLLED", { studentId: "student-1" });
    expect(auditPayloadFor("CLASS_GROUP_STUDENT_UNENROLLED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ studentId: "student-1", enrolled: true }),
        after: expect.objectContaining({ studentId: "student-1", enrolled: false }),
      }),
    );
    expectClassGroupRevalidation();
    expect(result.success).toBe(true);
  });

  it("creates a class group lesson with CLASS_GROUP_LESSON_CREATED audit metadata", async () => {
    getClassGroupByIdMock.mockResolvedValueOnce(groupRecord());
    createScheduledClassMock.mockResolvedValueOnce(lessonRecord());

    const { createClassGroupLessonAction } = await loadClassGroupActions();
    const result = await createClassGroupLessonAction(lessonForm());

    expect(createScheduledClassMock).toHaveBeenCalledWith(
      expect.objectContaining({
        classGroupId: "group-1",
        title: "Quadratic functions",
        teacherId: "teacher-1",
        subjectId: "subject-math",
      }),
      transactionClientMock,
    );
    expectClassGroupAuditTarget("CLASS_GROUP_LESSON_CREATED", {
      lessonId: "lesson-1",
      teacherId: "teacher-1",
    });
    expect(auditPayloadFor("CLASS_GROUP_LESSON_CREATED")).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({ id: "lesson-1", classGroupId: "group-1" }),
      }),
    );
    expectClassGroupRevalidation();
    expect(result.success).toBe(true);
  });

  it("updates a class group lesson with CLASS_GROUP_LESSON_UPDATED audit metadata", async () => {
    updateScheduledClassMock.mockResolvedValueOnce({
      before: lessonRecord({ title: "Old lesson" }),
      after: lessonRecord({ title: "Updated lesson" }),
    });

    const { updateClassGroupLessonAction } = await loadClassGroupActions();
    const result = await updateClassGroupLessonAction(lessonForm({ title: "Updated lesson" }));

    expect(updateScheduledClassMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({ title: "Updated lesson", classGroupId: "group-1" }),
      transactionClientMock,
    );
    expectClassGroupAuditTarget("CLASS_GROUP_LESSON_UPDATED", { lessonId: "lesson-1" });
    expect(auditPayloadFor("CLASS_GROUP_LESSON_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "lesson-1", title: "Old lesson" }),
        after: expect.objectContaining({ id: "lesson-1", title: "Updated lesson" }),
      }),
    );
    expectClassGroupRevalidation();
    expect(result.success).toBe(true);
  });

  it("deletes or cancels a class group lesson with CLASS_GROUP_LESSON_DELETED audit metadata", async () => {
    deleteScheduledClassMock.mockResolvedValueOnce(lessonRecord());

    const actions = await loadClassGroupActions();
    const action = getDeleteOrCancelLessonAction(actions);
    const result = await action(lessonForm());

    expect(deleteScheduledClassMock).toHaveBeenCalledWith("lesson-1", transactionClientMock);
    expectClassGroupAuditTarget("CLASS_GROUP_LESSON_DELETED", { lessonId: "lesson-1" });
    expect(auditPayloadFor("CLASS_GROUP_LESSON_DELETED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "lesson-1", classGroupId: "group-1" }),
        after: expect.objectContaining({ deleted: true }),
      }),
    );
    expectClassGroupRevalidation();
    expect(result.success).toBe(true);
  });

  it("does not write audit or revalidate when a class group mutation fails", async () => {
    updateClassGroupMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { updateClassGroupAction } = await loadClassGroupActions();
    const result = await updateClassGroupAction(validGroupForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/database unavailable|failed/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
