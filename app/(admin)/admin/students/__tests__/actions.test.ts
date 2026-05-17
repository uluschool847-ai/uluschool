import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const findUserByIdMock = vi.hoisted(() => vi.fn());
const createUserMock = vi.hoisted(() => vi.fn());
const updateUserProfileMock = vi.hoisted(() => vi.fn());
const toggleUserStatusMock = vi.hoisted(() => vi.fn());
const updateStudentLearningStatusMock = vi.hoisted(() => vi.fn());
const linkStudentParentMock = vi.hoisted(() => vi.fn());
const unlinkStudentParentMock = vi.hoisted(() => vi.fn());
const findClassByIdMock = vi.hoisted(() => vi.fn());
const getEnrolledClassesMock = vi.hoisted(() => vi.fn());
const linkStudentClassMock = vi.hoisted(() => vi.fn());
const unlinkStudentClassMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const transactionClientMock = vi.hoisted(() => ({ tx: true }));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClientMock),
  ),
}));
const revalidatePathMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn((url: string | URL) => ({ url: url.toString() })));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserById: findUserByIdMock,
}));

vi.mock("@/lib/repositories/class-repository", () => ({
  findById: findClassByIdMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  createUser: createUserMock,
  updateUserProfile: updateUserProfileMock,
  toggleUserStatus: toggleUserStatusMock,
  updateStudentLearningStatus: updateStudentLearningStatusMock,
  linkStudentParent: linkStudentParentMock,
  unlinkStudentParent: unlinkStudentParentMock,
  getEnrolledClasses: getEnrolledClassesMock,
  linkStudentClass: linkStudentClassMock,
  unlinkStudentClass: unlinkStudentClassMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

type StudentLearningStatus = "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE";

type StudentActionsModule = {
  createStudentAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  updateStudentAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  toggleStudentStatusAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  updateStudentLearningStatusAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  linkStudentParentAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  unlinkStudentParentAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  linkStudentClassAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  unlinkStudentClassAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
};

async function loadStudentActions() {
  const specifier = "@/app/(admin)/admin/students/actions";
  return import(/* @vite-ignore */ specifier) as Promise<StudentActionsModule>;
}

function buildStudentFormData(options?: {
  id?: string;
  fullName?: string;
  email?: string;
  phoneWhatsapp?: string;
  role?: string;
  isActive?: boolean;
  flash?: boolean;
  successRedirect?: string;
  errorRedirect?: string;
}) {
  const formData = new FormData();
  if (options?.id) formData.set("id", options.id);
  formData.set("fullName", options?.fullName ?? "Alice Student");
  formData.set("email", options?.email ?? "alice.student@example.com");
  formData.set("phoneWhatsapp", options?.phoneWhatsapp ?? "+254700000000");
  formData.set("role", options?.role ?? "ADMIN");
  if (typeof options?.isActive === "boolean") {
    formData.set("isActive", String(options.isActive));
  }
  if (options?.flash) formData.set("flash", "true");
  if (options?.successRedirect) formData.set("successRedirect", options.successRedirect);
  if (options?.errorRedirect) formData.set("errorRedirect", options.errorRedirect);
  return formData;
}

function buildStudentLearningStatusFormData(options?: {
  id?: string;
  learningStatus?: string;
  flash?: boolean;
  successRedirect?: string;
  errorRedirect?: string;
}) {
  const formData = new FormData();
  formData.set("id", options?.id ?? "student-1");
  formData.set("learningStatus", options?.learningStatus ?? "PAUSED");
  if (options?.flash) formData.set("flash", "true");
  if (options?.successRedirect) formData.set("successRedirect", options.successRedirect);
  if (options?.errorRedirect) formData.set("errorRedirect", options.errorRedirect);
  return formData;
}

function buildParentLinkFormData(options?: {
  studentId?: string;
  parentId?: string;
  flash?: boolean;
  successRedirect?: string;
  errorRedirect?: string;
}) {
  const formData = new FormData();
  formData.set("studentId", options?.studentId ?? "student-1");
  formData.set("parentId", options?.parentId ?? "parent-1");
  if (options?.flash) formData.set("flash", "true");
  if (options?.successRedirect) formData.set("successRedirect", options.successRedirect);
  if (options?.errorRedirect) formData.set("errorRedirect", options.errorRedirect);
  return formData;
}

function buildClassEnrollmentFormData(options?: {
  studentId?: string;
  classId?: string;
  flash?: boolean;
  successRedirect?: string;
  errorRedirect?: string;
}) {
  const formData = new FormData();
  formData.set("studentId", options?.studentId ?? "student-1");
  formData.set("classId", options?.classId ?? "class-1");
  if (options?.flash) formData.set("flash", "true");
  if (options?.successRedirect) formData.set("successRedirect", options.successRedirect);
  if (options?.errorRedirect) formData.set("errorRedirect", options.errorRedirect);
  return formData;
}

function formatFailureText(result: {
  message?: string;
  errors?: Record<string, string[] | undefined>;
}) {
  return [result.message, ...Object.values(result.errors ?? {}).flat()]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function expectAuditAfterMutation(mutationMock: { mock: { invocationCallOrder: number[] } }) {
  expect(createAdminAuditLogMock).toHaveBeenCalled();
  expect(mutationMock.mock.invocationCallOrder[0]).toBeLessThan(
    createAdminAuditLogMock.mock.invocationCallOrder[0],
  );
}

describe("Admin student account actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  it("requires an admin session before creating or editing student accounts", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const { createStudentAction } = await loadStudentActions();
    const result = await createStudentAction(buildStudentFormData());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(createUserMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/unauthorized|failed/i),
      }),
      transactionClientMock,
    );
  });

  it("creates a STUDENT account, keeps the role fixed, and passes phoneWhatsapp through", async () => {
    createUserMock.mockResolvedValueOnce({
      user: {
        id: "student-1",
        email: "alice.student@example.com",
        fullName: "Alice Student",
        phoneWhatsapp: "+254700000000",
        role: "STUDENT",
        learningStatus: "ACTIVE",
        isActive: true,
      },
      defaultPassword: "ChangeMe123!",
      mustResetPassword: true,
    });

    const { createStudentAction } = await loadStudentActions();
    const result = await createStudentAction(buildStudentFormData());

    expect(createUserMock.mock.calls[0]?.[0]).toEqual({
      fullName: "Alice Student",
      email: "alice.student@example.com",
      phoneWhatsapp: "+254700000000",
      role: "STUDENT",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "STUDENT_ACCOUNT_CREATED",
        targetType: "student",
        targetId: "student-1",
        before: null,
        after: expect.objectContaining({
          fullName: "Alice Student",
          email: "alice.student@example.com",
          phoneWhatsapp: "+254700000000",
          role: "STUDENT",
          learningStatus: "ACTIVE",
        }),
        meta: expect.objectContaining({
          actorRole: "ADMIN",
          studentId: "student-1",
        }),
      }),
      transactionClientMock,
    );
    expectAuditAfterMutation(createUserMock);
  });

  it("returns structured validation errors for missing or invalid student fields", async () => {
    const { createStudentAction } = await loadStudentActions();
    const formData = buildStudentFormData({
      fullName: "",
      email: "not-an-email",
    });

    const result = await createStudentAction(formData);

    expect(createUserMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          fullName: expect.arrayContaining([expect.stringMatching(/required|min 2/i)]),
          email: expect.arrayContaining([expect.stringMatching(/valid email|required/i)]),
        }),
      }),
      transactionClientMock,
    );
  });

  it("returns structured validation errors when updating a student with missing or invalid fields", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { updateStudentAction } = await loadStudentActions();
    const result = await updateStudentAction(
      buildStudentFormData({
        id: "student-1",
        fullName: "",
        email: "not-an-email",
        phoneWhatsapp: "+254711111111",
      }),
    );

    expect(updateUserProfileMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          fullName: expect.arrayContaining([expect.stringMatching(/required|min 2/i)]),
          email: expect.arrayContaining([expect.stringMatching(/valid email|required/i)]),
        }),
      }),
    );
  });

  it("returns structured duplicate-email feedback when create rejects", async () => {
    createUserMock.mockRejectedValueOnce(new Error("A user with this email already exists."));

    const { createStudentAction } = await loadStudentActions();
    const result = await createStudentAction(buildStudentFormData());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          email: expect.arrayContaining([expect.stringMatching(/already exists|duplicate/i)]),
        }),
      }),
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("redirects successful flash submissions with a student message", async () => {
    createUserMock.mockResolvedValueOnce({
      user: {
        id: "student-1",
        email: "alice.student@example.com",
        fullName: "Alice Student",
        role: "STUDENT",
        isActive: true,
      },
      defaultPassword: "ChangeMe123!",
      mustResetPassword: true,
    });

    const { createStudentAction } = await loadStudentActions();
    await createStudentAction(
      buildStudentFormData({
        flash: true,
        successRedirect: "/admin/students",
      }),
    );

    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("studentMessage="));
  });

  it("updates only allowed student fields and ignores any submitted role", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      phoneWhatsapp: "+254700000000",
    });
    updateUserProfileMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.updated@example.com",
      fullName: "Alice Updated",
      phoneWhatsapp: "+254711111111",
      role: "STUDENT",
    });

    const { updateStudentAction } = await loadStudentActions();
    const result = await updateStudentAction(
      buildStudentFormData({
        id: "student-1",
        fullName: "Alice Updated",
        email: "alice.updated@example.com",
        phoneWhatsapp: "+254711111111",
        role: "TEACHER",
      }),
    );

    expect(updateUserProfileMock.mock.calls[0]?.[0]).toEqual({
      userId: "student-1",
      fullName: "Alice Updated",
      email: "alice.updated@example.com",
      phoneWhatsapp: "+254711111111",
    });
    expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "STUDENT_PROFILE_UPDATED",
        targetType: "student",
        targetId: "student-1",
        before: expect.objectContaining({
          fullName: "Alice Student",
          email: "alice.student@example.com",
          phoneWhatsapp: "+254700000000",
        }),
        after: expect.objectContaining({
          fullName: "Alice Updated",
          email: "alice.updated@example.com",
          phoneWhatsapp: "+254711111111",
        }),
        meta: expect.objectContaining({
          actorRole: "ADMIN",
          studentId: "student-1",
        }),
      }),
      transactionClientMock,
    );
    const auditPayload = createAdminAuditLogMock.mock.calls[0]?.[0] as {
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    };
    expect(auditPayload.before?.role).not.toBe("TEACHER");
    expect(auditPayload.after?.role).not.toBe("TEACHER");
    expectAuditAfterMutation(updateUserProfileMock);
  });

  it("rejects updateStudentAction when the target account is not a student", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "teacher-1",
      email: "teacher@example.com",
      fullName: "Teacher User",
      role: "TEACHER",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { updateStudentAction } = await loadStudentActions();
    const result = await updateStudentAction(
      buildStudentFormData({
        id: "teacher-1",
        fullName: "Teacher User",
        email: "teacher@example.com",
        phoneWhatsapp: "+254711111111",
      }),
    );

    expect(findUserByIdMock).toHaveBeenCalledWith("teacher-1");
    expect(updateUserProfileMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(formatFailureText(result)).toMatch(/student|role|not allowed|invalid/i);
  });

  it("returns structured duplicate-email feedback when update rejects", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    updateUserProfileMock.mockRejectedValueOnce(
      new Error("A user with this email already exists."),
    );

    const { updateStudentAction } = await loadStudentActions();
    const result = await updateStudentAction(
      buildStudentFormData({
        id: "student-1",
        fullName: "Alice Updated",
        email: "alice.updated@example.com",
        phoneWhatsapp: "+254711111111",
      }),
    );

    expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          email: expect.arrayContaining([expect.stringMatching(/already exists|duplicate/i)]),
        }),
      }),
    );
  });

  it("toggles student active status and revalidates the registry", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    toggleUserStatusMock.mockResolvedValueOnce({
      id: "student-1",
      isActive: false,
    });

    const { toggleStudentStatusAction } = await loadStudentActions();
    const result = await toggleStudentStatusAction(
      buildStudentFormData({
        id: "student-1",
        isActive: false,
      }),
    );

    expect(toggleUserStatusMock).toHaveBeenCalledWith(
      "student-1",
      false,
      "admin-1",
      transactionClientMock,
    );
    expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "STUDENT_ACCOUNT_STATUS_UPDATED",
        targetType: "student",
        targetId: "student-1",
        before: expect.objectContaining({ isActive: true }),
        after: expect.objectContaining({ isActive: false }),
        meta: expect.objectContaining({ actorRole: "ADMIN" }),
      }),
      transactionClientMock,
    );
  });

  it("does not write an audit log when student account status mutation fails", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    toggleUserStatusMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { toggleStudentStatusAction } = await loadStudentActions();
    const result = await toggleStudentStatusAction(
      buildStudentFormData({
        id: "student-1",
        isActive: false,
      }),
    );

    expect(toggleUserStatusMock).toHaveBeenCalledWith(
      "student-1",
      false,
      "admin-1",
      transactionClientMock,
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it.each<StudentLearningStatus>(["TRIAL", "ACTIVE", "PAUSED", "INACTIVE"])(
    "sets student learning lifecycle status to %s without changing account access",
    async (learningStatus) => {
      findUserByIdMock.mockResolvedValueOnce({
        id: "student-1",
        email: "alice.student@example.com",
        fullName: "Alice Student",
        role: "STUDENT",
        isActive: true,
        learningStatus: "ACTIVE",
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
      });
      updateStudentLearningStatusMock.mockResolvedValueOnce({
        id: "student-1",
        role: "STUDENT",
        isActive: true,
        learningStatus,
      });

      const { updateStudentLearningStatusAction } = await loadStudentActions();
      const result = await updateStudentLearningStatusAction(
        buildStudentLearningStatusFormData({
          id: "student-1",
          learningStatus,
        }),
        transactionClientMock,
      );

      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
      expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
      expect(updateStudentLearningStatusMock).toHaveBeenCalledWith(
        "student-1",
        learningStatus,
        transactionClientMock,
      );
      expect(toggleUserStatusMock).not.toHaveBeenCalled();
      expect(updateUserProfileMock).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/status|lifecycle|updated/i),
        }),
        transactionClientMock,
      );
      expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
      expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students/student-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students/student-1/edit");
      expect(createAdminAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: "admin-1",
          action: "STUDENT_LEARNING_STATUS_UPDATED",
          targetType: "student",
          targetId: "student-1",
          before: expect.objectContaining({ learningStatus: "ACTIVE" }),
          after: expect.objectContaining({ learningStatus }),
          meta: expect.objectContaining({ actorRole: "ADMIN" }),
        }),
        transactionClientMock,
      );
    },
  );

  it("rejects invalid student learning lifecycle status values", async () => {
    const { updateStudentLearningStatusAction } = await loadStudentActions();
    const result = await updateStudentLearningStatusAction(
      buildStudentLearningStatusFormData({
        id: "student-1",
        learningStatus: "DELETED",
      }),
      transactionClientMock,
    );

    expect(updateStudentLearningStatusMock).not.toHaveBeenCalled();
    expect(toggleUserStatusMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          learningStatus: expect.arrayContaining([expect.stringMatching(/invalid|status/i)]),
        }),
      }),
      transactionClientMock,
    );
  });

  it("requires an admin session before changing student learning lifecycle status", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const { updateStudentLearningStatusAction } = await loadStudentActions();
    const result = await updateStudentLearningStatusAction(buildStudentLearningStatusFormData());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(updateStudentLearningStatusMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/unauthorized|failed/i),
      }),
      transactionClientMock,
    );
  });

  it("rejects learning lifecycle changes for non-student accounts", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      email: "parent@example.com",
      fullName: "Parent User",
      role: "PARENT",
      isActive: true,
    });

    const { updateStudentLearningStatusAction } = await loadStudentActions();
    const result = await updateStudentLearningStatusAction(
      buildStudentLearningStatusFormData({
        id: "parent-1",
        learningStatus: "PAUSED",
      }),
      transactionClientMock,
    );

    expect(findUserByIdMock).toHaveBeenCalledWith("parent-1");
    expect(updateStudentLearningStatusMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(formatFailureText(result)).toMatch(/student|role|not allowed|invalid/i);
  });

  it("requires an admin session before linking parent accounts", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const { linkStudentParentAction } = await loadStudentActions();
    const result = await linkStudentParentAction(buildParentLinkFormData());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(linkStudentParentMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/unauthorized|failed/i),
      }),
      transactionClientMock,
    );
  });

  it.each([
    {
      actionName: "updateStudentAction" as const,
      buildFormData: () =>
        buildStudentFormData({
          id: "student-1",
          fullName: "Alice Updated",
          email: "alice.updated@example.com",
          phoneWhatsapp: "+254711111111",
        }),
      expectedRepoCall: updateUserProfileMock,
    },
    {
      actionName: "toggleStudentStatusAction" as const,
      buildFormData: () =>
        buildStudentFormData({
          id: "student-1",
          isActive: false,
        }),
      expectedRepoCall: toggleUserStatusMock,
    },
    {
      actionName: "unlinkStudentParentAction" as const,
      buildFormData: () =>
        buildParentLinkFormData({
          studentId: "student-1",
          parentId: "parent-1",
        }),
      expectedRepoCall: unlinkStudentParentMock,
    },
    {
      actionName: "unlinkStudentClassAction" as const,
      buildFormData: () =>
        buildClassEnrollmentFormData({
          studentId: "student-1",
          classId: "class-1",
        }),
      expectedRepoCall: unlinkStudentClassMock,
    },
  ])(
    "requires an admin session before $actionName",
    async ({ actionName, buildFormData, expectedRepoCall }) => {
      requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

      const actions = await loadStudentActions();
      const result = await actions[actionName](buildFormData());

      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
      expect(expectedRepoCall).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/unauthorized|failed/i),
        }),
      );
    },
  );

  it("rejects parent-link actions when the student target is not a student", async () => {
    findUserByIdMock.mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
      fullName: "Teacher User",
      role: "TEACHER",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { linkStudentParentAction, unlinkStudentParentAction } = await loadStudentActions();
    const linkResult = await linkStudentParentAction(
      buildParentLinkFormData({
        studentId: "teacher-1",
        parentId: "parent-1",
      }),
      transactionClientMock,
    );
    const unlinkResult = await unlinkStudentParentAction(
      buildParentLinkFormData({
        studentId: "teacher-1",
        parentId: "parent-1",
      }),
      transactionClientMock,
    );

    expect(linkStudentParentMock).not.toHaveBeenCalled();
    expect(unlinkStudentParentMock).not.toHaveBeenCalled();
    expect(formatFailureText(linkResult)).toMatch(/student|role|not allowed|invalid/i);
    expect(formatFailureText(unlinkResult)).toMatch(/student|role|not allowed|invalid/i);
  });

  it("links a parent to a student and revalidates the registry plus edit page", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      email: "mary.parent@example.com",
      fullName: "Mary Parent",
      role: "PARENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    linkStudentParentMock.mockResolvedValueOnce({ studentId: "student-1", parentId: "parent-1" });

    const { linkStudentParentAction } = await loadStudentActions();
    const result = await linkStudentParentAction(
      buildParentLinkFormData({
        studentId: "student-1",
        parentId: "parent-1",
      }),
      transactionClientMock,
    );

    expect(findUserByIdMock).toHaveBeenNthCalledWith(1, "student-1");
    expect(findUserByIdMock).toHaveBeenNthCalledWith(2, "parent-1");
    expect(linkStudentParentMock).toHaveBeenCalledWith(
      "student-1",
      "parent-1",
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students/student-1/edit");
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "STUDENT_PARENT_LINKED",
        targetType: "student",
        targetId: "student-1",
        before: expect.objectContaining({ parentId: null }),
        after: expect.objectContaining({
          parentId: "parent-1",
          parentName: "Mary Parent",
        }),
        meta: expect.objectContaining({ actorRole: "ADMIN" }),
      }),
      transactionClientMock,
    );
  });

  it("rejects non-parent accounts as linked parents", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findUserByIdMock.mockResolvedValueOnce({
      id: "teacher-1",
      email: "teacher@example.com",
      fullName: "Teacher User",
      role: "TEACHER",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { linkStudentParentAction } = await loadStudentActions();
    const result = await linkStudentParentAction(
      buildParentLinkFormData({
        studentId: "student-1",
        parentId: "teacher-1",
      }),
      transactionClientMock,
    );

    expect(linkStudentParentMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/parent|role|not allowed|invalid/i),
      }),
    );
  });

  it("prevents duplicate parent links with field-level feedback", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      email: "mary.parent@example.com",
      fullName: "Mary Parent",
      role: "PARENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    linkStudentParentMock.mockRejectedValueOnce(new Error("Parent already linked."));

    const { linkStudentParentAction } = await loadStudentActions();
    const result = await linkStudentParentAction(
      buildParentLinkFormData({
        studentId: "student-1",
        parentId: "parent-1",
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          parentId: expect.arrayContaining([expect.stringMatching(/already linked|duplicate/i)]),
        }),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("removes a parent link and revalidates the registry plus edit page", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      email: "mary.parent@example.com",
      fullName: "Mary Parent",
      role: "PARENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    unlinkStudentParentMock.mockResolvedValueOnce({ studentId: "student-1", parentId: "parent-1" });

    const { unlinkStudentParentAction } = await loadStudentActions();
    const result = await unlinkStudentParentAction(
      buildParentLinkFormData({
        studentId: "student-1",
        parentId: "parent-1",
      }),
    );

    expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
    expect(unlinkStudentParentMock).toHaveBeenCalledWith(
      "student-1",
      "parent-1",
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students/student-1/edit");
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "STUDENT_PARENT_UNLINKED",
        targetType: "student",
        targetId: "student-1",
        before: expect.objectContaining({
          parentId: "parent-1",
          parentName: "Mary Parent",
        }),
        after: expect.objectContaining({ parentId: null }),
        meta: expect.objectContaining({ actorRole: "ADMIN" }),
      }),
      transactionClientMock,
    );
  });

  it("rejects unlinkStudentParentAction when the parent target is not a parent", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findUserByIdMock.mockResolvedValueOnce({
      id: "teacher-1",
      email: "teacher@example.com",
      fullName: "Teacher User",
      role: "TEACHER",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { unlinkStudentParentAction } = await loadStudentActions();
    const result = await unlinkStudentParentAction(
      buildParentLinkFormData({
        studentId: "student-1",
        parentId: "teacher-1",
      }),
    );

    expect(findUserByIdMock).toHaveBeenNthCalledWith(1, "student-1");
    expect(findUserByIdMock).toHaveBeenNthCalledWith(2, "teacher-1");
    expect(unlinkStudentParentMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/parent|role|not allowed|invalid/i),
      }),
    );
  });

  it("requires an admin session before enrolling or unenrolling student classes", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const { linkStudentClassAction } = await loadStudentActions();
    const result = await linkStudentClassAction(buildClassEnrollmentFormData());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(linkStudentClassMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/unauthorized|failed/i),
      }),
    );
  });

  it("links a class to a student and revalidates the registry plus edit page", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findClassByIdMock.mockResolvedValueOnce({
      id: "class-1",
      title: "Mathematics 8A",
      startAt: new Date("2026-05-06T09:00:00.000Z"),
      teacher: {
        id: "teacher-1",
        fullName: "Jane Doe",
      },
    });
    linkStudentClassMock.mockResolvedValueOnce({ studentId: "student-1", classId: "class-1" });

    const { linkStudentClassAction } = await loadStudentActions();
    const result = await linkStudentClassAction(
      buildClassEnrollmentFormData({
        studentId: "student-1",
        classId: "class-1",
      }),
    );

    expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
    expect(findClassByIdMock).toHaveBeenCalledWith("class-1");
    expect(linkStudentClassMock).toHaveBeenCalledWith(
      "student-1",
      "class-1",
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students/student-1/edit");
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "STUDENT_CLASS_ENROLLED",
        targetType: "student",
        targetId: "student-1",
        before: expect.objectContaining({ classId: null }),
        after: expect.objectContaining({
          classId: "class-1",
          classTitle: "Mathematics 8A",
        }),
        meta: expect.objectContaining({ actorRole: "ADMIN" }),
      }),
      transactionClientMock,
    );
  });

  it("rejects class enrollment when the target account is not a student", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "teacher-1",
      email: "teacher@example.com",
      fullName: "Teacher User",
      role: "TEACHER",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { linkStudentClassAction, unlinkStudentClassAction } = await loadStudentActions();
    const linkResult = await linkStudentClassAction(
      buildClassEnrollmentFormData({
        studentId: "teacher-1",
        classId: "class-1",
      }),
    );
    const unlinkResult = await unlinkStudentClassAction(
      buildClassEnrollmentFormData({
        studentId: "teacher-1",
        classId: "class-1",
      }),
    );

    expect(findClassByIdMock).not.toHaveBeenCalled();
    expect(linkStudentClassMock).not.toHaveBeenCalled();
    expect(unlinkStudentClassMock).not.toHaveBeenCalled();
    expect(formatFailureText(linkResult)).toMatch(/student|role|not allowed|invalid/i);
    expect(formatFailureText(unlinkResult)).toMatch(/student|role|not allowed|invalid/i);
  });

  it("rejects class enrollment when the target class does not exist", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findClassByIdMock.mockResolvedValueOnce(null);

    const { linkStudentClassAction, unlinkStudentClassAction } = await loadStudentActions();
    const linkResult = await linkStudentClassAction(
      buildClassEnrollmentFormData({
        studentId: "student-1",
        classId: "missing-class",
      }),
    );
    const unlinkResult = await unlinkStudentClassAction(
      buildClassEnrollmentFormData({
        studentId: "student-1",
        classId: "missing-class",
      }),
    );

    expect(findClassByIdMock).toHaveBeenCalledWith("missing-class");
    expect(linkStudentClassMock).not.toHaveBeenCalled();
    expect(unlinkStudentClassMock).not.toHaveBeenCalled();
    expect(formatFailureText(linkResult)).toMatch(/class|not found|not allowed|invalid/i);
    expect(formatFailureText(unlinkResult)).toMatch(/class|not found|not allowed|invalid/i);
  });

  it("rejects class enrollment when the target class does not exist", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findClassByIdMock.mockResolvedValueOnce(null);

    const { linkStudentClassAction } = await loadStudentActions();
    const result = await linkStudentClassAction(
      buildClassEnrollmentFormData({
        studentId: "student-1",
        classId: "missing-class",
      }),
    );

    expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
    expect(findClassByIdMock).toHaveBeenCalledWith("missing-class");
    expect(linkStudentClassMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(formatFailureText(result)).toMatch(/class|not found|not allowed|invalid/i);
  });

  it("prevents duplicate class enrollments with field-level feedback", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findClassByIdMock.mockResolvedValueOnce({
      id: "class-1",
      title: "Mathematics 8A",
      startAt: new Date("2026-05-06T09:00:00.000Z"),
      teacher: {
        id: "teacher-1",
        fullName: "Jane Doe",
      },
    });
    linkStudentClassMock.mockRejectedValueOnce(new Error("Class already enrolled."));

    const { linkStudentClassAction } = await loadStudentActions();
    const result = await linkStudentClassAction(
      buildClassEnrollmentFormData({
        studentId: "student-1",
        classId: "class-1",
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          classId: expect.arrayContaining([expect.stringMatching(/already enrolled|duplicate/i)]),
        }),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("removes a class enrollment and revalidates the registry plus edit page", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    findClassByIdMock.mockResolvedValueOnce({
      id: "class-1",
      title: "Mathematics 8A",
      startAt: new Date("2026-05-06T09:00:00.000Z"),
      teacher: {
        id: "teacher-1",
        fullName: "Jane Doe",
      },
    });
    unlinkStudentClassMock.mockResolvedValueOnce({ studentId: "student-1", classId: "class-1" });

    const { unlinkStudentClassAction } = await loadStudentActions();
    const result = await unlinkStudentClassAction(
      buildClassEnrollmentFormData({
        studentId: "student-1",
        classId: "class-1",
      }),
    );

    expect(findUserByIdMock).toHaveBeenCalledWith("student-1");
    expect(findClassByIdMock).toHaveBeenCalledWith("class-1");
    expect(unlinkStudentClassMock).toHaveBeenCalledWith(
      "student-1",
      "class-1",
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students/student-1/edit");
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "STUDENT_CLASS_UNENROLLED",
        targetType: "student",
        targetId: "student-1",
        before: expect.objectContaining({
          classId: "class-1",
          classTitle: "Mathematics 8A",
        }),
        after: expect.objectContaining({ classId: null }),
        meta: expect.objectContaining({ actorRole: "ADMIN" }),
      }),
      transactionClientMock,
    );
  });

  it("rejects toggleStudentStatusAction when the target account is not a student", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "teacher-1",
      email: "teacher@example.com",
      fullName: "Teacher User",
      role: "TEACHER",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { toggleStudentStatusAction } = await loadStudentActions();
    const result = await toggleStudentStatusAction(
      buildStudentFormData({
        id: "teacher-1",
        isActive: false,
      }),
    );

    expect(findUserByIdMock).toHaveBeenCalledWith("teacher-1");
    expect(toggleUserStatusMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(formatFailureText(result)).toMatch(/student|role|not allowed|invalid/i);
  });

  it.each([
    {
      name: "student account create",
      setup: () => {
        createUserMock.mockResolvedValueOnce({
          user: {
            id: "student-1",
            email: "alice.student@example.com",
            fullName: "Alice Student",
            phoneWhatsapp: "+254700000000",
            role: "STUDENT",
            learningStatus: "ACTIVE",
            isActive: true,
          },
          defaultPassword: "ChangeMe123!",
          mustResetPassword: true,
        });
      },
      run: async (actions: StudentActionsModule) =>
        actions.createStudentAction(buildStudentFormData()),
      mutation: createUserMock,
    },
    {
      name: "student profile update",
      setup: () => {
        findUserByIdMock.mockResolvedValueOnce({
          id: "student-1",
          email: "alice.student@example.com",
          fullName: "Alice Student",
          phoneWhatsapp: "+254700000000",
          role: "STUDENT",
          isActive: true,
        });
        updateUserProfileMock.mockResolvedValueOnce({
          id: "student-1",
          email: "alice.updated@example.com",
          fullName: "Alice Updated",
          phoneWhatsapp: "+254711111111",
          role: "STUDENT",
        });
      },
      run: async (actions: StudentActionsModule) =>
        actions.updateStudentAction(
          buildStudentFormData({
            id: "student-1",
            fullName: "Alice Updated",
            email: "alice.updated@example.com",
            phoneWhatsapp: "+254711111111",
          }),
        ),
      mutation: updateUserProfileMock,
    },
    {
      name: "student account status",
      setup: () => {
        findUserByIdMock.mockResolvedValueOnce({
          id: "student-1",
          email: "alice.student@example.com",
          fullName: "Alice Student",
          role: "STUDENT",
          isActive: true,
        });
        toggleUserStatusMock.mockResolvedValueOnce({ id: "student-1", isActive: false });
      },
      run: async (actions: StudentActionsModule) =>
        actions.toggleStudentStatusAction(
          buildStudentFormData({ id: "student-1", isActive: false }),
        ),
      mutation: toggleUserStatusMock,
    },
    {
      name: "student learning status",
      setup: () => {
        findUserByIdMock.mockResolvedValueOnce({
          id: "student-1",
          email: "alice.student@example.com",
          fullName: "Alice Student",
          role: "STUDENT",
          isActive: true,
          learningStatus: "ACTIVE",
        });
        updateStudentLearningStatusMock.mockResolvedValueOnce({
          id: "student-1",
          role: "STUDENT",
          isActive: true,
          learningStatus: "PAUSED",
        });
      },
      run: async (actions: StudentActionsModule) =>
        actions.updateStudentLearningStatusAction(
          buildStudentLearningStatusFormData({ id: "student-1", learningStatus: "PAUSED" }),
        ),
      mutation: updateStudentLearningStatusMock,
    },
    {
      name: "parent link",
      setup: () => {
        findUserByIdMock
          .mockResolvedValueOnce({
            id: "student-1",
            email: "alice.student@example.com",
            fullName: "Alice Student",
            role: "STUDENT",
            isActive: true,
          })
          .mockResolvedValueOnce({
            id: "parent-1",
            email: "mary.parent@example.com",
            fullName: "Mary Parent",
            role: "PARENT",
            isActive: true,
          });
        linkStudentParentMock.mockResolvedValueOnce({
          studentId: "student-1",
          parentId: "parent-1",
        });
      },
      run: async (actions: StudentActionsModule) =>
        actions.linkStudentParentAction(buildParentLinkFormData()),
      mutation: linkStudentParentMock,
    },
    {
      name: "parent unlink",
      setup: () => {
        findUserByIdMock
          .mockResolvedValueOnce({
            id: "student-1",
            email: "alice.student@example.com",
            fullName: "Alice Student",
            role: "STUDENT",
            isActive: true,
          })
          .mockResolvedValueOnce({
            id: "parent-1",
            email: "mary.parent@example.com",
            fullName: "Mary Parent",
            role: "PARENT",
            isActive: true,
          });
        unlinkStudentParentMock.mockResolvedValueOnce({
          studentId: "student-1",
          parentId: "parent-1",
        });
      },
      run: async (actions: StudentActionsModule) =>
        actions.unlinkStudentParentAction(buildParentLinkFormData()),
      mutation: unlinkStudentParentMock,
    },
    {
      name: "class enrollment",
      setup: () => {
        findUserByIdMock.mockResolvedValueOnce({
          id: "student-1",
          email: "alice.student@example.com",
          fullName: "Alice Student",
          role: "STUDENT",
          isActive: true,
        });
        findClassByIdMock.mockResolvedValueOnce({
          id: "class-1",
          title: "Mathematics 8A",
          startAt: new Date("2026-05-06T09:00:00.000Z"),
          teacher: { id: "teacher-1", fullName: "Jane Doe" },
        });
        linkStudentClassMock.mockResolvedValueOnce({ studentId: "student-1", classId: "class-1" });
      },
      run: async (actions: StudentActionsModule) =>
        actions.linkStudentClassAction(buildClassEnrollmentFormData()),
      mutation: linkStudentClassMock,
    },
    {
      name: "class unenrollment",
      setup: () => {
        findUserByIdMock.mockResolvedValueOnce({
          id: "student-1",
          email: "alice.student@example.com",
          fullName: "Alice Student",
          role: "STUDENT",
          isActive: true,
        });
        findClassByIdMock.mockResolvedValueOnce({
          id: "class-1",
          title: "Mathematics 8A",
          startAt: new Date("2026-05-06T09:00:00.000Z"),
          teacher: { id: "teacher-1", fullName: "Jane Doe" },
        });
        unlinkStudentClassMock.mockResolvedValueOnce({
          studentId: "student-1",
          classId: "class-1",
        });
      },
      run: async (actions: StudentActionsModule) =>
        actions.unlinkStudentClassAction(buildClassEnrollmentFormData()),
      mutation: unlinkStudentClassMock,
    },
  ])(
    "fails $name mutation transaction when audit logging fails",
    async ({ setup, run, mutation }) => {
      setup();
      createAdminAuditLogMock.mockRejectedValueOnce(new Error("Audit unavailable"));

      const actions = await loadStudentActions();
      const result = await run(actions);

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(mutation).toHaveBeenCalled();
      expect(createAdminAuditLogMock).toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ success: false }));
    },
  );

  it("redirects validation failures with a student error message in flash mode", async () => {
    const { createStudentAction } = await loadStudentActions();
    const formData = buildStudentFormData({
      flash: true,
      errorRedirect: "/admin/students/new",
      fullName: "",
      email: "invalid-email",
    });

    const result = await createStudentAction(formData);

    expect(result.success).toBe(false);
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("studentError="));
    expect(createUserMock).not.toHaveBeenCalled();
  });
});
