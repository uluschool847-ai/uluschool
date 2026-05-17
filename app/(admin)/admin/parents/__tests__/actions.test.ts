import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const findUserByIdMock = vi.hoisted(() => vi.fn());
const createUserMock = vi.hoisted(() => vi.fn());
const updateUserProfileMock = vi.hoisted(() => vi.fn());
const toggleUserStatusMock = vi.hoisted(() => vi.fn());
const linkParentStudentMock = vi.hoisted(() => vi.fn());
const unlinkParentStudentMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/repositories/portal-repository", () => ({
  createUser: createUserMock,
  updateUserProfile: updateUserProfileMock,
  toggleUserStatus: toggleUserStatusMock,
  linkParentStudent: linkParentStudentMock,
  unlinkParentStudent: unlinkParentStudentMock,
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

type ParentActionsModule = {
  createParentAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  updateParentAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  toggleParentStatusAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  linkParentStudentAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  unlinkParentStudentAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
};

async function loadParentActions() {
  const specifier = "@/app/(admin)/admin/parents/actions";
  return import(/* @vite-ignore */ specifier) as Promise<ParentActionsModule>;
}

function buildParentFormData(options?: {
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
  formData.set("fullName", options?.fullName ?? "Mary Parent");
  formData.set("email", options?.email ?? "mary.parent@example.com");
  formData.set("phoneWhatsapp", options?.phoneWhatsapp ?? "+254700000001");
  formData.set("role", options?.role ?? "ADMIN");
  if (typeof options?.isActive === "boolean") {
    formData.set("isActive", String(options.isActive));
  }
  if (options?.flash) formData.set("flash", "true");
  if (options?.successRedirect) formData.set("successRedirect", options.successRedirect);
  if (options?.errorRedirect) formData.set("errorRedirect", options.errorRedirect);
  return formData;
}

function buildStudentLinkFormData(options?: {
  parentId?: string;
  studentId?: string;
  flash?: boolean;
  successRedirect?: string;
  errorRedirect?: string;
}) {
  const formData = new FormData();
  formData.set("parentId", options?.parentId ?? "parent-1");
  formData.set("studentId", options?.studentId ?? "student-1");
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

describe("Admin parent account actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  it("requires an admin session before parent account writes", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const { createParentAction } = await loadParentActions();
    const result = await createParentAction(buildParentFormData());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(createUserMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/unauthorized|failed/i),
      }),
    );
  });

  it("creates a portal-capable PARENT account and ignores submitted role", async () => {
    createUserMock.mockResolvedValueOnce({
      user: {
        id: "parent-1",
        email: "mary.parent@example.com",
        fullName: "Mary Parent",
        role: "PARENT",
        isActive: true,
      },
      defaultPassword: "ChangeMe123!",
      mustResetPassword: true,
    });

    const { createParentAction } = await loadParentActions();
    const result = await createParentAction(buildParentFormData({ role: "ADMIN" }));

    expect(createUserMock).toHaveBeenCalledWith(
      {
        fullName: "Mary Parent",
        email: "mary.parent@example.com",
        phoneWhatsapp: "+254700000001",
        role: "PARENT",
      },
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/parents");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "PARENT_ACCOUNT_CREATED",
        targetType: "parent",
        targetId: "parent-1",
        before: null,
        after: expect.objectContaining({
          id: "parent-1",
          fullName: "Mary Parent",
          email: "mary.parent@example.com",
          isActive: true,
        }),
        meta: expect.objectContaining({ actorRole: "ADMIN", parentId: "parent-1" }),
      }),
      transactionClientMock,
    );
    expectAuditAfterMutation(createUserMock);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/created|parent/i),
      }),
    );
  });

  it("returns structured validation errors for missing name or invalid email", async () => {
    const { createParentAction } = await loadParentActions();
    const result = await createParentAction(
      buildParentFormData({
        fullName: "",
        email: "not-an-email",
      }),
    );

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
    );
  });

  it("surfaces duplicate-email feedback on create and update", async () => {
    createUserMock.mockRejectedValueOnce(new Error("A user with this email already exists."));

    const { createParentAction, updateParentAction } = await loadParentActions();
    const createResult = await createParentAction(buildParentFormData());

    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(createResult).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          email: expect.arrayContaining([expect.stringMatching(/already exists|duplicate/i)]),
        }),
      }),
    );

    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      email: "mary.parent@example.com",
      fullName: "Mary Parent",
      phoneWhatsapp: "+254700000001",
      isActive: true,
    });
    updateUserProfileMock.mockRejectedValueOnce(
      new Error("A user with this email already exists."),
    );

    const updateResult = await updateParentAction(
      buildParentFormData({
        id: "parent-1",
        email: "existing.parent@example.com",
      }),
    );

    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(updateResult).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          email: expect.arrayContaining([expect.stringMatching(/already exists|duplicate/i)]),
        }),
      }),
    );
  });

  it("updates only parent contact fields and rejects non-parent targets", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      email: "mary.parent@example.com",
      fullName: "Mary Parent",
      phoneWhatsapp: "+254700000001",
      isActive: true,
    });
    updateUserProfileMock.mockResolvedValueOnce({
      id: "parent-1",
      fullName: "Mary Updated",
      email: "mary.updated@example.com",
      phoneWhatsapp: "+254700000002",
    });

    const { updateParentAction } = await loadParentActions();
    const result = await updateParentAction(
      buildParentFormData({
        id: "parent-1",
        fullName: "Mary Updated",
        email: "mary.updated@example.com",
        phoneWhatsapp: "+254700000002",
        role: "STUDENT",
      }),
    );

    expect(updateUserProfileMock).toHaveBeenCalledWith(
      {
        userId: "parent-1",
        fullName: "Mary Updated",
        email: "mary.updated@example.com",
        phoneWhatsapp: "+254700000002",
      },
      transactionClientMock,
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "PARENT_ACCOUNT_UPDATED",
        targetType: "parent",
        targetId: "parent-1",
        before: expect.objectContaining({
          fullName: "Mary Parent",
          email: "mary.parent@example.com",
          phoneWhatsapp: "+254700000001",
        }),
        after: expect.objectContaining({
          fullName: "Mary Updated",
          email: "mary.updated@example.com",
          phoneWhatsapp: "+254700000002",
        }),
        meta: expect.objectContaining({ actorRole: "ADMIN", parentId: "parent-1" }),
      }),
      transactionClientMock,
    );
    expectAuditAfterMutation(updateUserProfileMock);
    expect(result).toEqual(expect.objectContaining({ success: true }));

    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      email: "student@example.com",
      fullName: "Alice Student",
      isActive: true,
    });

    const rejected = await updateParentAction(
      buildParentFormData({
        id: "student-1",
      }),
    );

    expect(formatFailureText(rejected)).toMatch(/parent|role|not allowed|invalid/i);
  });

  it("toggles parent active status only for parent targets", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      email: "mary.parent@example.com",
      fullName: "Mary Parent",
      isActive: true,
    });
    toggleUserStatusMock.mockResolvedValueOnce({ id: "parent-1", isActive: false });

    const { toggleParentStatusAction } = await loadParentActions();
    const result = await toggleParentStatusAction(
      buildParentFormData({
        id: "parent-1",
        isActive: false,
      }),
    );

    expect(toggleUserStatusMock).toHaveBeenCalledWith(
      "parent-1",
      false,
      "admin-1",
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/parents");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "PARENT_ACCOUNT_STATUS_UPDATED",
        targetType: "parent",
        targetId: "parent-1",
        before: expect.objectContaining({ isActive: true }),
        after: expect.objectContaining({ isActive: false }),
        meta: expect.objectContaining({ actorRole: "ADMIN", parentId: "parent-1" }),
      }),
      transactionClientMock,
    );
    expectAuditAfterMutation(toggleUserStatusMock);
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("links and unlinks students from a parent with route revalidation", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      fullName: "Mary Parent",
    });
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      fullName: "Alice Student",
    });
    linkParentStudentMock.mockResolvedValueOnce({ parentId: "parent-1", studentId: "student-1" });

    const { linkParentStudentAction, unlinkParentStudentAction } = await loadParentActions();
    const linkResult = await linkParentStudentAction(buildStudentLinkFormData());

    expect(linkParentStudentMock).toHaveBeenCalledWith(
      "parent-1",
      "student-1",
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/parents");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/parents/parent-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/parents/parent-1/edit");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "PARENT_STUDENT_LINKED",
        targetType: "parent",
        targetId: "parent-1",
        before: expect.objectContaining({ studentId: null }),
        after: expect.objectContaining({
          studentId: "student-1",
          studentName: "Alice Student",
        }),
        meta: expect.objectContaining({
          actorRole: "ADMIN",
          parentId: "parent-1",
          studentId: "student-1",
        }),
      }),
      transactionClientMock,
    );
    expectAuditAfterMutation(linkParentStudentMock);
    expect(linkResult).toEqual(expect.objectContaining({ success: true }));

    createAdminAuditLogMock.mockClear();
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      fullName: "Mary Parent",
    });
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      fullName: "Alice Student",
    });
    unlinkParentStudentMock.mockResolvedValueOnce({
      parentId: "parent-1",
      studentId: "student-1",
    });

    const unlinkResult = await unlinkParentStudentAction(buildStudentLinkFormData());

    expect(unlinkParentStudentMock).toHaveBeenCalledWith(
      "parent-1",
      "student-1",
      transactionClientMock,
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "PARENT_STUDENT_UNLINKED",
        targetType: "parent",
        targetId: "parent-1",
        before: expect.objectContaining({
          studentId: "student-1",
          studentName: "Alice Student",
        }),
        after: expect.objectContaining({ studentId: null }),
        meta: expect.objectContaining({
          actorRole: "ADMIN",
          parentId: "parent-1",
          studentId: "student-1",
        }),
      }),
      transactionClientMock,
    );
    expectAuditAfterMutation(unlinkParentStudentMock);
    expect(unlinkResult).toEqual(expect.objectContaining({ success: true }));
  });

  it("rejects non-parent targets before linking or unlinking students", async () => {
    findUserByIdMock.mockResolvedValueOnce({ id: "student-parent-target", role: "STUDENT" });

    const { linkParentStudentAction, unlinkParentStudentAction } = await loadParentActions();
    const linkResult = await linkParentStudentAction(
      buildStudentLinkFormData({ parentId: "student-parent-target" }),
    );

    expect(linkParentStudentMock).not.toHaveBeenCalled();
    expect(formatFailureText(linkResult)).toMatch(/parent|role|not allowed|invalid/i);

    findUserByIdMock.mockResolvedValueOnce({ id: "student-parent-target", role: "STUDENT" });

    const unlinkResult = await unlinkParentStudentAction(
      buildStudentLinkFormData({ parentId: "student-parent-target" }),
    );

    expect(unlinkParentStudentMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(formatFailureText(unlinkResult)).toMatch(/parent|role|not allowed|invalid/i);
  });

  it("rejects invalid student link targets and duplicate parent-student links visibly", async () => {
    findUserByIdMock.mockResolvedValueOnce({ id: "parent-1", role: "PARENT" });
    findUserByIdMock.mockResolvedValueOnce({ id: "teacher-1", role: "TEACHER" });

    const { linkParentStudentAction } = await loadParentActions();
    const invalidRoleResult = await linkParentStudentAction(
      buildStudentLinkFormData({ studentId: "teacher-1" }),
    );

    expect(linkParentStudentMock).not.toHaveBeenCalled();
    expect(formatFailureText(invalidRoleResult)).toMatch(/student|role|not allowed|invalid/i);

    findUserByIdMock.mockResolvedValueOnce({ id: "parent-1", role: "PARENT" });
    findUserByIdMock.mockResolvedValueOnce({ id: "student-1", role: "STUDENT" });
    linkParentStudentMock.mockRejectedValueOnce(new Error("Student already linked."));

    const duplicateResult = await linkParentStudentAction(buildStudentLinkFormData());

    expect(duplicateResult).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          studentId: expect.arrayContaining([expect.stringMatching(/already linked|duplicate/i)]),
        }),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects invalid student unlink targets before repository mutation", async () => {
    findUserByIdMock.mockResolvedValueOnce({ id: "parent-1", role: "PARENT" });
    findUserByIdMock.mockResolvedValueOnce({ id: "teacher-1", role: "TEACHER" });

    const { unlinkParentStudentAction } = await loadParentActions();
    const result = await unlinkParentStudentAction(
      buildStudentLinkFormData({ studentId: "teacher-1" }),
    );

    expect(unlinkParentStudentMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(formatFailureText(result)).toMatch(/student|role|not allowed|invalid/i);
  });

  it.each([
    {
      name: "parent create",
      setup: () => {
        createUserMock.mockRejectedValueOnce(new Error("Database unavailable"));
      },
      run: async (actions: ParentActionsModule) =>
        actions.createParentAction(buildParentFormData()),
      mutation: createUserMock,
    },
    {
      name: "parent update",
      setup: () => {
        findUserByIdMock.mockResolvedValueOnce({
          id: "parent-1",
          role: "PARENT",
          email: "mary.parent@example.com",
          fullName: "Mary Parent",
          isActive: true,
        });
        updateUserProfileMock.mockRejectedValueOnce(new Error("Database unavailable"));
      },
      run: async (actions: ParentActionsModule) =>
        actions.updateParentAction(buildParentFormData({ id: "parent-1" })),
      mutation: updateUserProfileMock,
    },
    {
      name: "parent status",
      setup: () => {
        findUserByIdMock.mockResolvedValueOnce({
          id: "parent-1",
          role: "PARENT",
          email: "mary.parent@example.com",
          fullName: "Mary Parent",
          isActive: true,
        });
        toggleUserStatusMock.mockRejectedValueOnce(new Error("Database unavailable"));
      },
      run: async (actions: ParentActionsModule) =>
        actions.toggleParentStatusAction(buildParentFormData({ id: "parent-1", isActive: false })),
      mutation: toggleUserStatusMock,
    },
    {
      name: "student link",
      setup: () => {
        findUserByIdMock
          .mockResolvedValueOnce({ id: "parent-1", role: "PARENT", fullName: "Mary Parent" })
          .mockResolvedValueOnce({ id: "student-1", role: "STUDENT", fullName: "Alice Student" });
        linkParentStudentMock.mockRejectedValueOnce(new Error("Database unavailable"));
      },
      run: async (actions: ParentActionsModule) =>
        actions.linkParentStudentAction(buildStudentLinkFormData()),
      mutation: linkParentStudentMock,
    },
    {
      name: "student unlink",
      setup: () => {
        findUserByIdMock
          .mockResolvedValueOnce({ id: "parent-1", role: "PARENT", fullName: "Mary Parent" })
          .mockResolvedValueOnce({ id: "student-1", role: "STUDENT", fullName: "Alice Student" });
        unlinkParentStudentMock.mockRejectedValueOnce(new Error("Database unavailable"));
      },
      run: async (actions: ParentActionsModule) =>
        actions.unlinkParentStudentAction(buildStudentLinkFormData()),
      mutation: unlinkParentStudentMock,
    },
  ])("does not write audit logs when $name mutation fails", async ({ setup, run, mutation }) => {
    setup();

    const actions = await loadParentActions();
    const result = await run(actions);

    expect(mutation).toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("redirects flash submissions with visible success or error feedback", async () => {
    createUserMock.mockResolvedValueOnce({
      user: {
        id: "parent-1",
        email: "mary.parent@example.com",
        fullName: "Mary Parent",
        role: "PARENT",
        isActive: true,
      },
      defaultPassword: "ChangeMe123!",
      mustResetPassword: true,
    });

    const { createParentAction } = await loadParentActions();
    await createParentAction(
      buildParentFormData({
        flash: true,
        successRedirect: "/admin/parents",
        errorRedirect: "/admin/parents/new",
      }),
    );

    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("parentMessage="));

    await createParentAction(
      buildParentFormData({
        flash: true,
        fullName: "",
        email: "invalid",
        errorRedirect: "/admin/parents/new",
      }),
    );

    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("parentError="));
  });
});
