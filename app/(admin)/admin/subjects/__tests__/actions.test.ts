import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createSubjectMock = vi.hoisted(() => vi.fn());
const updateSubjectMock = vi.hoisted(() => vi.fn());
const setSubjectActiveMock = vi.hoisted(() => vi.fn());
const deleteSubjectMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as Error & { digest?: string; url?: string }).digest = "NEXT_REDIRECT";
    (error as Error & { digest?: string; url?: string }).url = url;
    throw error;
  }),
);
const transactionClientMock = vi.hoisted(() => ({ tx: true }));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof transactionClientMock) => unknown) =>
    callback(transactionClientMock),
  ),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/subject-repository", () => ({
  createSubject: createSubjectMock,
  deleteSubject: deleteSubjectMock,
  setSubjectActive: setSubjectActiveMock,
  updateSubject: updateSubjectMock,
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

type SubjectActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

type SubjectActionsModule = {
  createSubjectAction: (formData: FormData) => Promise<SubjectActionResult>;
  updateSubjectAction: (formData: FormData) => Promise<SubjectActionResult>;
  toggleSubjectStatusAction: (formData: FormData) => Promise<SubjectActionResult>;
  deleteSubjectAction?: (formData: FormData) => Promise<SubjectActionResult>;
  archiveSubjectAction?: (formData: FormData) => Promise<SubjectActionResult>;
};

async function loadSubjectActions() {
  const specifier = "@/app/(admin)/admin/subjects/actions";
  return import(/* @vite-ignore */ specifier) as Promise<SubjectActionsModule>;
}

function validSubjectForm(overrides?: Partial<Record<string, string | boolean>>) {
  const formData = new FormData();
  formData.set("id", "subject-1");
  formData.set("name", "Biology");
  formData.set("slug", "biology");
  formData.set("description", "Biology support for Cambridge and exam preparation.");
  formData.set("priority", "1");
  formData.set("isActive", "true");
  for (const [key, value] of Object.entries(overrides ?? {})) {
    formData.set(key, String(value));
  }
  return formData;
}

function deleteFormData(overrides?: Record<string, string>) {
  const formData = new FormData();
  formData.set("id", "subject-1");
  for (const [key, value] of Object.entries(overrides ?? {})) {
    formData.set(key, value);
  }
  return formData;
}

function subjectRecord(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "subject-1",
    slug: "biology",
    name: "Biology",
    description: "Biology support for Cambridge and exam preparation.",
    isActive: true,
    priority: 1,
    teachersCount: 2,
    createdAt: new Date("2026-05-01T09:00:00.000Z"),
    updatedAt: new Date("2026-05-10T09:00:00.000Z"),
    ...overrides,
  };
}

function auditPayloadFor(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action)?.[0];
}

function expectSubjectAuditTarget(action: string) {
  expect(auditPayloadFor(action)).toEqual(
    expect.objectContaining({
      adminUserId: "admin-1",
      action,
      targetType: "subject",
      targetId: "subject-1",
      meta: expect.objectContaining({
        actorRole: "ADMIN",
        subjectId: "subject-1",
      }),
    }),
  );
}

function expectSubjectRevalidation() {
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/subjects");
  expect(revalidatePathMock).toHaveBeenCalledWith("/subjects");
  expect(revalidatePathMock).toHaveBeenCalledWith("/curriculum");
  expect(revalidatePathMock).toHaveBeenCalledWith("/teachers");
}

function getDeleteOrArchiveAction(actions: SubjectActionsModule) {
  const action = actions.deleteSubjectAction ?? actions.archiveSubjectAction;
  if (!action) {
    throw new Error("Expected deleteSubjectAction or archiveSubjectAction to be exported.");
  }
  return action;
}

describe("Admin subject actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transactionClientMock) => unknown) =>
        callback(transactionClientMock),
    );
  });

  it("requires ADMIN before create, update, status, and delete/archive mutations", async () => {
    const actions = await loadSubjectActions();

    for (const action of [
      actions.createSubjectAction,
      actions.updateSubjectAction,
      actions.toggleSubjectStatusAction,
      getDeleteOrArchiveAction(actions),
    ]) {
      vi.clearAllMocks();
      requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

      const result = await action(validSubjectForm());

      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/unauthorized|failed/i),
        }),
      );
    }

    expect(createSubjectMock).not.toHaveBeenCalled();
    expect(updateSubjectMock).not.toHaveBeenCalled();
    expect(setSubjectActiveMock).not.toHaveBeenCalled();
    expect(deleteSubjectMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it.each([
    { field: "name", value: "", errorKey: "name", pattern: /required/i },
    { field: "slug", value: "", errorKey: "slug", pattern: /required/i },
    { field: "slug", value: "Upper Case", errorKey: "slug", pattern: /lowercase|url|slug/i },
    { field: "slug", value: "biology!", errorKey: "slug", pattern: /url|safe|slug/i },
    { field: "priority", value: "first", errorKey: "priority", pattern: /number|numeric/i },
  ])(
    "returns create validation errors for invalid $field",
    async ({ field, value, errorKey, pattern }) => {
      const { createSubjectAction } = await loadSubjectActions();
      const formData = validSubjectForm({ [field]: value });

      const result = await createSubjectAction(formData);

      expect(result).toEqual({
        success: false,
        errors: {
          [errorKey]: expect.arrayContaining([expect.stringMatching(pattern)]),
        },
      });
      expect(createSubjectMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { field: "name", value: "", errorKey: "name", pattern: /required/i },
    { field: "slug", value: "", errorKey: "slug", pattern: /required/i },
    { field: "slug", value: "Upper Case", errorKey: "slug", pattern: /lowercase|url|slug/i },
    { field: "slug", value: "biology!", errorKey: "slug", pattern: /url|safe|slug/i },
    { field: "priority", value: "first", errorKey: "priority", pattern: /number|numeric/i },
  ])(
    "returns update validation errors for invalid $field",
    async ({ field, value, errorKey, pattern }) => {
      const { updateSubjectAction } = await loadSubjectActions();
      const formData = validSubjectForm({ [field]: value });

      const result = await updateSubjectAction(formData);

      expect(result).toEqual({
        success: false,
        errors: {
          [errorKey]: expect.arrayContaining([expect.stringMatching(pattern)]),
        },
      });
      expect(updateSubjectMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it("surfaces duplicate slug errors on create without writing an audit log", async () => {
    createSubjectMock.mockRejectedValueOnce(new Error("Subject slug already exists."));

    const { createSubjectAction } = await loadSubjectActions();
    const result = await createSubjectAction(validSubjectForm({ slug: "biology" }));

    expect(createSubjectMock).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/slug.*already exists|already exists.*slug/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("creates a subject, audits before/after values transaction-safely, and revalidates dependent routes", async () => {
    createSubjectMock.mockResolvedValueOnce(subjectRecord());

    const { createSubjectAction } = await loadSubjectActions();
    const result = await createSubjectAction(validSubjectForm());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(createSubjectMock).toHaveBeenCalledWith(
      {
        name: "Biology",
        slug: "biology",
        description: "Biology support for Cambridge and exam preparation.",
        priority: 1,
        isActive: true,
      },
      transactionClientMock,
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "SUBJECT_CREATED",
        targetType: "subject",
        targetId: "subject-1",
        before: null,
        after: expect.objectContaining({
          id: "subject-1",
          name: "Biology",
          slug: "biology",
          priority: 1,
          isActive: true,
        }),
        meta: expect.objectContaining({ actorRole: "ADMIN", subjectId: "subject-1" }),
      }),
      transactionClientMock,
    );
    expectSubjectRevalidation();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/subject.*created/i),
      }),
    );
  });

  it("updates a subject and writes a SUBJECT_UPDATED audit log in the same transaction", async () => {
    updateSubjectMock.mockResolvedValueOnce({
      before: subjectRecord({ name: "Biology", priority: 5 }),
      after: subjectRecord({ name: "Human Biology", priority: 2 }),
    });

    const { updateSubjectAction } = await loadSubjectActions();
    const result = await updateSubjectAction(
      validSubjectForm({ name: "Human Biology", priority: "2" }),
    );

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(updateSubjectMock).toHaveBeenCalledWith(
      "subject-1",
      expect.objectContaining({
        name: "Human Biology",
        slug: "biology",
        description: "Biology support for Cambridge and exam preparation.",
        priority: 2,
        isActive: true,
      }),
      transactionClientMock,
    );
    expectSubjectAuditTarget("SUBJECT_UPDATED");
    expect(auditPayloadFor("SUBJECT_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          id: "subject-1",
          slug: "biology",
          name: "Biology",
          description: "Biology support for Cambridge and exam preparation.",
          isActive: true,
          priority: 5,
        }),
        after: expect.objectContaining({ name: "Human Biology", priority: 2 }),
      }),
    );
    expect(auditPayloadFor("SUBJECT_UPDATED")?.before).not.toEqual({ id: "subject-1" });
    expectSubjectRevalidation();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/subject.*updated/i),
      }),
    );
  });

  it("toggles subject active state and writes a SUBJECT_STATUS_UPDATED audit log", async () => {
    setSubjectActiveMock.mockResolvedValueOnce({
      before: subjectRecord({ isActive: true }),
      after: subjectRecord({ isActive: false }),
    });

    const { toggleSubjectStatusAction } = await loadSubjectActions();
    const formData = deleteFormData({ isActive: "false" });
    const result = await toggleSubjectStatusAction(formData);

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(setSubjectActiveMock).toHaveBeenCalledWith("subject-1", false, transactionClientMock);
    expectSubjectAuditTarget("SUBJECT_STATUS_UPDATED");
    expect(auditPayloadFor("SUBJECT_STATUS_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          id: "subject-1",
          slug: "biology",
          name: "Biology",
          description: "Biology support for Cambridge and exam preparation.",
          isActive: true,
          priority: 1,
        }),
        after: expect.objectContaining({ isActive: false }),
      }),
    );
    expect(auditPayloadFor("SUBJECT_STATUS_UPDATED")?.before).not.toEqual({ id: "subject-1" });
    expectSubjectRevalidation();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/subject.*(deactivated|updated|inactive)/i),
      }),
    );
  });

  it("deletes or archives a subject only when no dependencies exist and writes an audit log", async () => {
    deleteSubjectMock.mockResolvedValueOnce(subjectRecord());

    const actions = await loadSubjectActions();
    const action = getDeleteOrArchiveAction(actions);
    const result = await action(deleteFormData());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(deleteSubjectMock).toHaveBeenCalledWith("subject-1", transactionClientMock);
    const deleteAudit = auditPayloadFor("SUBJECT_DELETED") ?? auditPayloadFor("SUBJECT_ARCHIVED");
    expect(deleteAudit).toEqual(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: expect.stringMatching(/SUBJECT_(DELETED|ARCHIVED)/),
        targetType: "subject",
        targetId: "subject-1",
        before: expect.objectContaining({ id: "subject-1", slug: "biology" }),
        after: expect.objectContaining({ deleted: true }),
        meta: expect.objectContaining({ actorRole: "ADMIN", subjectId: "subject-1" }),
      }),
    );
    expectSubjectRevalidation();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/subject.*(deleted|archived)/i),
      }),
    );
  });

  it("fails delete/archive with visible error feedback when dependencies exist", async () => {
    deleteSubjectMock.mockRejectedValueOnce(
      new Error("Subject has dependencies and cannot be deleted safely."),
    );

    const actions = await loadSubjectActions();
    const action = getDeleteOrArchiveAction(actions);
    const result = await action(deleteFormData());

    expect(deleteSubjectMock).toHaveBeenCalledWith("subject-1", transactionClientMock);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/dependencies|cannot be deleted|archive/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("redirects flash delete/archive failures with a visible subject error message", async () => {
    deleteSubjectMock.mockRejectedValueOnce(
      new Error("Subject has dependencies and cannot be deleted safely."),
    );

    const actions = await loadSubjectActions();
    const action = getDeleteOrArchiveAction(actions);

    await expect(
      action(
        deleteFormData({
          flash: "true",
          errorRedirect: "/admin/subjects?q=biology",
        }),
      ),
    ).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
      url: expect.stringContaining("subjectError="),
    });
    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringContaining("Subject%20has%20dependencies"),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("does not write an audit log when create mutation fails", async () => {
    createSubjectMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { createSubjectAction } = await loadSubjectActions();
    const result = await createSubjectAction(validSubjectForm());

    expect(createSubjectMock).toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/database unavailable|failed/i),
      }),
    );
  });

  it("does not write an audit log when update mutation fails", async () => {
    updateSubjectMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { updateSubjectAction } = await loadSubjectActions();
    const result = await updateSubjectAction(validSubjectForm());

    expect(updateSubjectMock).toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/database unavailable|failed/i),
      }),
    );
  });

  it("does not write an audit log when status mutation fails", async () => {
    setSubjectActiveMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { toggleSubjectStatusAction } = await loadSubjectActions();
    const result = await toggleSubjectStatusAction(deleteFormData({ isActive: "false" }));

    expect(setSubjectActiveMock).toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/database unavailable|failed/i),
      }),
    );
  });

  it("does not write an audit log when delete/archive mutation fails", async () => {
    deleteSubjectMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const actions = await loadSubjectActions();
    const action = getDeleteOrArchiveAction(actions);
    const result = await action(deleteFormData());

    expect(deleteSubjectMock).toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/database unavailable|failed/i),
      }),
    );
  });
});
