import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createTeacherMock = vi.hoisted(() => vi.fn());
const updateTeacherMock = vi.hoisted(() => vi.fn());
const setTeacherActiveMock = vi.hoisted(() => vi.fn());
const deleteTeacherMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const storageUploadMock = vi.hoisted(() => vi.fn());
const storageDeleteMock = vi.hoisted(() => vi.fn());
const storageGetUrlMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const transactionClientMock = vi.hoisted(() => ({ tx: true }));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClientMock),
  ),
}));
const createStorageServiceMock = vi.hoisted(() =>
  vi.fn(() => ({
    upload: storageUploadMock,
    delete: storageDeleteMock,
    getURL: storageGetUrlMock,
  })),
);

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/cms-repository", () => ({
  createTeacher: createTeacherMock,
  updateTeacher: updateTeacherMock,
  setTeacherActive: setTeacherActiveMock,
  deleteTeacher: deleteTeacherMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  createStorageService: createStorageServiceMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type TeachersActionsModule = {
  createTeacherAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  updateTeacherAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  toggleTeacherStatusAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
  deleteTeacherAction: (formData: FormData) => Promise<{
    success: boolean;
    message?: string;
    errors?: Record<string, string[] | undefined>;
  }>;
};

async function loadTeachersActions() {
  const specifier = "@/app/(admin)/admin/teachers/actions";
  return import(/* @vite-ignore */ specifier) as Promise<TeachersActionsModule>;
}

function getTeacherAuditPayload(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action)?.[0];
}

function expectTeacherAuditTarget(action: string) {
  expect(getTeacherAuditPayload(action)).toEqual(
    expect.objectContaining({
      adminUserId: "admin-1",
      action,
      targetType: "teacher",
      targetId: "teacher-1",
      meta: expect.objectContaining({
        actorRole: "ADMIN",
        teacherProfileId: "teacher-1",
      }),
    }),
  );
}

function buildBaseFormData(options?: {
  subjects?: string[];
  cabinetUserId?: string;
  flash?: boolean;
  successRedirect?: string;
  errorRedirect?: string;
}) {
  const formData = new FormData();
  formData.set("fullName", "Jane Doe");
  formData.set("title", "Mathematics Teacher");
  formData.set(
    "bio",
    "Cambridge mathematics specialist with more than eight years of online teaching experience.",
  );
  formData.set("displayOrder", "1");
  formData.set("isActive", "true");
  if (options?.subjects) {
    for (const subject of options.subjects) {
      formData.append("subjects", subject);
    }
  }
  if (options?.cabinetUserId) {
    formData.set("cabinetUserId", options.cabinetUserId);
  }
  if (options?.flash) {
    formData.set("flash", "true");
  }
  if (options?.successRedirect) {
    formData.set("successRedirect", options.successRedirect);
  }
  if (options?.errorRedirect) {
    formData.set("errorRedirect", options.errorRedirect);
  }
  return formData;
}

describe("Admin teacher profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
    redirectMock.mockReset();
    storageUploadMock.mockReset();
    storageDeleteMock.mockReset();
    storageGetUrlMock.mockImplementation((key: string) => storageUrlForKey(key));
  });

  it("returns validation errors for empty or short teacher fields", async () => {
    const { createTeacherAction } = await loadTeachersActions();
    const formData = new FormData();
    formData.set("fullName", "");
    formData.set("title", "A");
    formData.set("bio", "Too short");
    formData.set("displayOrder", "1");

    const result = await createTeacherAction(formData);

    expect(result).toEqual({
      success: false,
      errors: {
        fullName: expect.arrayContaining([expect.stringMatching(/required|min 2/i)]),
        title: expect.arrayContaining([expect.stringMatching(/required|min 2/i)]),
        bio: expect.arrayContaining([expect.stringMatching(/min 20|required/i)]),
      },
    });
    expect(createTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it("requires an admin session before mutating teacher records", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const { createTeacherAction } = await loadTeachersActions();
    const result = await createTeacherAction(buildBaseFormData());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/unauthorized|failed/i),
      }),
    );
    expect(createTeacherMock).not.toHaveBeenCalled();
  });

  it("returns a validation error for a non-numeric displayOrder", async () => {
    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set("displayOrder", "first");

    const result = await createTeacherAction(formData);

    expect(result).toEqual({
      success: false,
      errors: {
        displayOrder: expect.arrayContaining([expect.stringMatching(/number|numeric/i)]),
      },
    });
    expect(createTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it("rejects uploaded photo files with disallowed MIME types", async () => {
    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set("photo", new File(["<script />"], "teacher.svg", { type: "image/svg+xml" }));

    const result = await createTeacherAction(formData);

    expect(result).toEqual({
      success: false,
      errors: {
        photo: expect.arrayContaining([expect.stringMatching(/jpg|jpeg|png|webp|image/i)]),
      },
    });
    expect(createTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects uploaded photo files over 5 MB", async () => {
    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    const oversized = new Uint8Array(6 * 1024 * 1024);
    formData.set("photo", new File([oversized], "teacher.png", { type: "image/png" }));

    const result = await createTeacherAction(formData);

    expect(result).toEqual({
      success: false,
      errors: {
        photo: expect.arrayContaining([expect.stringMatching(/5 ?mb|too large|size/i)]),
      },
    });
    expect(createTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("uploads a teacher photo on create and persists the public URL", async () => {
    const storageKey = "public/teachers/admin-1/00000000-0000-4000-8000-000000000001-jane-doe.webp";
    const publicUrl = storageUrlForKey(storageKey);
    storageUploadMock.mockResolvedValueOnce(storageKey);
    createTeacherMock.mockResolvedValueOnce({ id: "teacher-1" });

    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData({
      subjects: ["subject-1", "subject-2"],
      cabinetUserId: "teacher-123",
    });
    formData.set(
      "photo",
      new File([new Uint8Array([1, 2, 3])], "jane-doe.webp", { type: "image/webp" }),
    );

    const result = await createTeacherAction(formData);

    expect(storageUploadMock).toHaveBeenCalledWith(expect.any(File), {
      filename: "jane-doe.webp",
      namespace: "public/teachers/admin-1",
      contentType: "image/webp",
    });
    expect(createTeacherMock).toHaveBeenCalledWith(
      {
        fullName: "Jane Doe",
        title: "Mathematics Teacher",
        bio: "Cambridge mathematics specialist with more than eight years of online teaching experience.",
        photoUrl: publicUrl,
        subjects: ["subject-1", "subject-2"],
        cabinetUserId: "teacher-123",
        displayOrder: 1,
        isActive: true,
      },
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/teachers");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teachers");
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expectTeacherAuditTarget("TEACHER_PROFILE_CREATED");
    expect(getTeacherAuditPayload("TEACHER_PROFILE_CREATED")).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({
          id: "teacher-1",
          fullName: "Jane Doe",
          title: "Mathematics Teacher",
          bio: "Cambridge mathematics specialist with more than eight years of online teaching experience.",
          photoUrl: publicUrl,
          subjects: ["subject-1", "subject-2"],
          cabinetUserId: "teacher-123",
          displayOrder: 1,
          isActive: true,
        }),
      }),
    );
    const auditPayload = getTeacherAuditPayload("TEACHER_PROFILE_CREATED") as {
      after?: Record<string, unknown>;
    };
    expect(auditPayload.after?.role).toBeUndefined();
  });

  it("bounds teacher photo storage failures without exposing infrastructure details", async () => {
    storageUploadMock.mockRejectedValueOnce(
      new Error("R2 secret access key leaked from private/teachers/admin-1/photo.webp"),
    );
    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set(
      "photo",
      new File([new Uint8Array([1, 2, 3])], "teacher.webp", { type: "image/webp" }),
    );

    const result = await createTeacherAction(formData);

    expect(result).toEqual({
      success: false,
      errors: { photo: ["Failed to store teacher photo."] },
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|r2|private\/teachers|photo\.webp/i);
    expect(createTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it("does not delete an uploaded photo when canonical URL generation fails", async () => {
    const storageKey = "public/teachers/admin-1/url-failure.webp";
    storageUploadMock.mockResolvedValueOnce(storageKey);
    storageGetUrlMock.mockImplementationOnce(() => {
      throw new Error("Storage URL unavailable");
    });
    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set(
      "photo",
      new File([new Uint8Array([1, 2, 3])], "url-failure.webp", { type: "image/webp" }),
    );

    const result = await createTeacherAction(formData);

    expect(result).toEqual({
      success: false,
      errors: { photo: ["Failed to store teacher photo."] },
    });
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(createTeacherMock).not.toHaveBeenCalled();
  });

  it("does not delete a newly uploaded photo when success redirect runs after commit", async () => {
    const storageKey = "public/teachers/admin-1/redirected-photo.webp";
    storageUploadMock.mockResolvedValueOnce(storageKey);
    createTeacherMock.mockResolvedValueOnce({ id: "teacher-1" });
    redirectMock.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });
    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData({
      flash: true,
      successRedirect: "/admin/teachers",
    });
    formData.set(
      "photo",
      new File([new Uint8Array([1, 2, 3])], "redirected-photo.webp", { type: "image/webp" }),
    );

    await expect(createTeacherAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(createAdminAuditLogMock).toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it("best-effort deletes a newly uploaded create photo after the audited transaction rolls back", async () => {
    const events: string[] = [];
    const storageKey = "public/teachers/admin-1/create-rollback.webp";
    storageUploadMock.mockResolvedValueOnce(storageKey);
    createTeacherMock.mockResolvedValueOnce({ id: "teacher-1" });
    createAdminAuditLogMock.mockImplementationOnce(async () => {
      events.push("audit-failed");
      throw new Error("Audit unavailable");
    });
    storageDeleteMock.mockImplementationOnce(async (key: string) => {
      events.push(`cleanup:${key}`);
    });

    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set(
      "photo",
      new File([new Uint8Array([1, 2, 3])], "create-rollback.webp", { type: "image/webp" }),
    );

    const result = await createTeacherAction(formData);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/audit unavailable/i),
      }),
    );
    expect(storageDeleteMock).toHaveBeenCalledWith(storageKey);
    expect(events).toEqual(["audit-failed", `cleanup:${storageKey}`]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("keeps the create transaction failure when rollback photo cleanup also fails", async () => {
    const storageKey = "public/teachers/admin-1/create-cleanup-failure.webp";
    storageUploadMock.mockResolvedValueOnce(storageKey);
    createTeacherMock.mockResolvedValueOnce({ id: "teacher-1" });
    createAdminAuditLogMock.mockRejectedValueOnce(new Error("Audit unavailable"));
    storageDeleteMock.mockRejectedValueOnce(new Error("R2 cleanup unavailable"));

    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set(
      "photo",
      new File([new Uint8Array([1, 2, 3])], "cleanup-failure.webp", { type: "image/webp" }),
    );

    const result = await createTeacherAction(formData);

    expect(storageDeleteMock).toHaveBeenCalledWith(storageKey);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/audit unavailable/i),
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(/r2|cleanup/i);
  });

  it("creates a teacher profile and revalidates both public and admin pages", async () => {
    createTeacherMock.mockResolvedValueOnce({
      id: "teacher-1",
      fullName: "Jane Doe",
      title: "Mathematics Teacher",
      bio: "Cambridge mathematics specialist with more than eight years of online teaching experience.",
      subjects: ["subject-1", "subject-2"],
      cabinetUserId: "teacher-123",
      displayOrder: 1,
      isActive: true,
    });

    const { createTeacherAction } = await loadTeachersActions();
    const result = await createTeacherAction(
      buildBaseFormData({
        subjects: ["subject-1", "subject-2"],
        cabinetUserId: "teacher-123",
      }),
    );

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(createTeacherMock).toHaveBeenCalledWith(
      {
        fullName: "Jane Doe",
        title: "Mathematics Teacher",
        bio: "Cambridge mathematics specialist with more than eight years of online teaching experience.",
        subjects: ["subject-1", "subject-2"],
        cabinetUserId: "teacher-123",
        displayOrder: 1,
        isActive: true,
      },
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/teachers");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teachers");
    if (result !== undefined) {
      expect(result).toEqual(expect.objectContaining({ success: true }));
    }
    expectTeacherAuditTarget("TEACHER_PROFILE_CREATED");
    expect(getTeacherAuditPayload("TEACHER_PROFILE_CREATED")).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({
          id: "teacher-1",
          fullName: "Jane Doe",
          title: "Mathematics Teacher",
          bio: "Cambridge mathematics specialist with more than eight years of online teaching experience.",
          subjects: ["subject-1", "subject-2"],
          cabinetUserId: "teacher-123",
          displayOrder: 1,
          isActive: true,
        }),
      }),
    );
  });

  it("updates an existing teacher profile and supports photo removal by persisting null", async () => {
    updateTeacherMock.mockResolvedValueOnce({
      id: "teacher-1",
      before: {
        id: "teacher-1",
        fullName: "Jane Doe",
        title: "Mathematics Teacher",
        photoUrl: "/uploads/teacher-1/old-photo.webp",
        subjects: ["subject-1"],
        cabinetUserId: "teacher-123",
        isActive: true,
      },
      after: {
        id: "teacher-1",
        fullName: "Jane Doe",
        title: "Mathematics Teacher",
        photoUrl: null,
        subjects: ["subject-3"],
        cabinetUserId: "teacher-456",
        isActive: true,
      },
    });

    const { updateTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData({
      subjects: ["subject-3"],
      cabinetUserId: "teacher-456",
    });
    formData.set("id", "teacher-1");
    formData.set("photoUrl", "");

    const result = await updateTeacherAction(formData);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(updateTeacherMock).toHaveBeenCalledWith(
      "teacher-1",
      expect.objectContaining({
        fullName: "Jane Doe",
        title: "Mathematics Teacher",
        subjects: ["subject-3"],
        cabinetUserId: "teacher-456",
        photoUrl: null,
      }),
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/teachers");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teachers");
    if (result !== undefined) {
      expect(result).toEqual(expect.objectContaining({ success: true }));
    }
    expect(storageDeleteMock).toHaveBeenCalledWith("uploads/teacher-1/old-photo.webp");
    expectTeacherAuditTarget("TEACHER_PROFILE_UPDATED");
    expect(getTeacherAuditPayload("TEACHER_PROFILE_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          id: "teacher-1",
          photoUrl: "/uploads/teacher-1/old-photo.webp",
          subjects: ["subject-1"],
          cabinetUserId: "teacher-123",
        }),
        after: expect.objectContaining({
          id: "teacher-1",
          photoUrl: null,
          subjects: ["subject-3"],
          cabinetUserId: "teacher-456",
        }),
      }),
    );
  });

  it("best-effort deletes only the newly uploaded update photo after audit rollback", async () => {
    const newStorageKey = "public/teachers/admin-1/update-rollback.webp";
    const oldStorageKey = "public/teachers/admin-1/existing-photo.webp";
    const events: string[] = [];
    storageUploadMock.mockResolvedValueOnce(newStorageKey);
    updateTeacherMock.mockResolvedValueOnce({
      id: "teacher-1",
      before: { id: "teacher-1", photoUrl: storageUrlForKey(oldStorageKey) },
      after: { id: "teacher-1", photoUrl: storageUrlForKey(newStorageKey) },
    });
    createAdminAuditLogMock.mockImplementationOnce(async () => {
      events.push("audit-failed");
      throw new Error("Audit unavailable");
    });
    storageDeleteMock.mockImplementationOnce(async (key: string) => {
      events.push(`cleanup:${key}`);
    });

    const { updateTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set("id", "teacher-1");
    formData.set("photoUrl", storageUrlForKey(oldStorageKey));
    formData.set(
      "photo",
      new File([new Uint8Array([4, 5, 6])], "update-rollback.webp", { type: "image/webp" }),
    );

    const result = await updateTeacherAction(formData);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/audit unavailable/i),
      }),
    );
    expect(storageDeleteMock).toHaveBeenCalledTimes(1);
    expect(storageDeleteMock).toHaveBeenCalledWith(newStorageKey);
    expect(storageDeleteMock).not.toHaveBeenCalledWith(oldStorageKey);
    expect(events).toEqual(["audit-failed", `cleanup:${newStorageKey}`]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not delete a newly uploaded photo after the audited create transaction commits", async () => {
    const storageKey = "public/teachers/admin-1/committed-photo.webp";
    storageUploadMock.mockResolvedValueOnce(storageKey);
    createTeacherMock.mockResolvedValueOnce({ id: "teacher-1" });
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("Revalidation unavailable");
    });

    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set(
      "photo",
      new File([new Uint8Array([7, 8, 9])], "committed-photo.webp", { type: "image/webp" }),
    );

    const result = await createTeacherAction(formData);

    expect(createAdminAuditLogMock).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it("updates an existing teacher profile with a replacement photo and removes the previous upload", async () => {
    const newStorageKey =
      "public/teachers/admin-1/00000000-0000-4000-8000-000000000002-jane-updated.webp";
    storageUploadMock.mockResolvedValueOnce(newStorageKey);
    storageGetUrlMock.mockReturnValueOnce(storageUrlForKey(newStorageKey));
    updateTeacherMock.mockResolvedValueOnce({
      id: "teacher-1",
      before: {
        id: "teacher-1",
        photoUrl: "/uploads/teacher-1/old-photo.webp",
      },
      after: {
        id: "teacher-1",
        photoUrl: storageUrlForKey(newStorageKey),
      },
    });

    const { updateTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData({
      subjects: ["subject-1", "subject-2"],
      cabinetUserId: "teacher-123",
    });
    formData.set("id", "teacher-1");
    formData.set("photoUrl", "/uploads/attacker/forged.webp");
    formData.set(
      "photo",
      new File([new Uint8Array([4, 5, 6])], "jane-updated.webp", { type: "image/webp" }),
    );

    const result = await updateTeacherAction(formData);

    expect(storageUploadMock).toHaveBeenCalledWith(expect.any(File), {
      filename: "jane-updated.webp",
      namespace: "public/teachers/admin-1",
      contentType: "image/webp",
    });
    expect(storageDeleteMock).toHaveBeenCalledWith("uploads/teacher-1/old-photo.webp");
    expect(storageDeleteMock).not.toHaveBeenCalledWith(newStorageKey);
    expect(updateTeacherMock).toHaveBeenCalledWith(
      "teacher-1",
      expect.objectContaining({
        fullName: "Jane Doe",
        title: "Mathematics Teacher",
        subjects: ["subject-1", "subject-2"],
        cabinetUserId: "teacher-123",
        photoUrl: storageUrlForKey(newStorageKey),
      }),
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/teachers");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teachers");
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expectTeacherAuditTarget("TEACHER_PROFILE_UPDATED");
    expect(getTeacherAuditPayload("TEACHER_PROFILE_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          id: "teacher-1",
          photoUrl: "/uploads/teacher-1/old-photo.webp",
        }),
        after: expect.objectContaining({
          id: "teacher-1",
          photoUrl: storageUrlForKey(newStorageKey),
        }),
      }),
    );
  });

  it("deletes the decoded key for a replaced opaque application photo URL", async () => {
    const oldStorageKey =
      "public/teachers/admin-1/00000000-0000-4000-8000-000000000001-old-photo.webp";
    const newStorageKey =
      "public/teachers/admin-1/00000000-0000-4000-8000-000000000002-new-photo.webp";
    storageUploadMock.mockResolvedValueOnce(newStorageKey);
    storageGetUrlMock.mockReturnValueOnce(storageUrlForKey(newStorageKey));
    updateTeacherMock.mockResolvedValueOnce({
      id: "teacher-1",
      before: { id: "teacher-1", photoUrl: storageUrlForKey(oldStorageKey) },
      after: { id: "teacher-1", photoUrl: storageUrlForKey(newStorageKey) },
    });

    const { updateTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set("id", "teacher-1");
    formData.set("photoUrl", "/uploads/attacker/forged.webp");
    formData.set(
      "photo",
      new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], "new-photo.webp", {
        type: "image/webp",
      }),
    );

    const result = await updateTeacherAction(formData);

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(storageDeleteMock).toHaveBeenCalledWith(oldStorageKey);
    expect(storageDeleteMock).not.toHaveBeenCalledWith("/uploads/attacker/forged.webp");
  });

  it("toggles teacher public visibility and revalidates the teachers page", async () => {
    setTeacherActiveMock.mockResolvedValueOnce({
      id: "teacher-1",
      before: { id: "teacher-1", isActive: true },
      after: { id: "teacher-1", isActive: false },
      isActive: false,
    });

    const { toggleTeacherStatusAction } = await loadTeachersActions();
    const formData = new FormData();
    formData.set("id", "teacher-1");
    formData.set("isActive", "false");

    const result = await toggleTeacherStatusAction(formData);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(setTeacherActiveMock).toHaveBeenCalledWith("teacher-1", false, transactionClientMock);
    expect(revalidatePathMock).toHaveBeenCalledWith("/teachers");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teachers");
    if (result !== undefined) {
      expect(result).toEqual(expect.objectContaining({ success: true }));
    }
    expectTeacherAuditTarget("TEACHER_PROFILE_STATUS_UPDATED");
    expect(getTeacherAuditPayload("TEACHER_PROFILE_STATUS_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "teacher-1", isActive: true }),
        after: expect.objectContaining({ id: "teacher-1", isActive: false }),
      }),
    );
  });

  it("redirects successful flash submissions with a teacher message", async () => {
    createTeacherMock.mockResolvedValueOnce({ id: "teacher-1" });

    const { createTeacherAction } = await loadTeachersActions();
    await createTeacherAction(
      buildBaseFormData({
        flash: true,
        successRedirect: "/admin/teachers",
        subjects: ["subject-1"],
        cabinetUserId: "teacher-123",
      }),
    );

    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringContaining("teacherMessage=Teacher%20profile%20created."),
    );
  });

  it("redirects validation failures with a teacher error message in flash mode", async () => {
    const { createTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData({
      flash: true,
      errorRedirect: "/admin/teachers/new",
    });
    formData.set("fullName", "");
    formData.set("bio", "Too short");

    const result = await createTeacherAction(formData);

    expect(result.success).toBe(false);
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("teacherError="));
    expect(createTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("deletes a teacher profile and returns visible success feedback", async () => {
    deleteTeacherMock.mockResolvedValueOnce({ id: "teacher-1" });

    const { deleteTeacherAction } = await loadTeachersActions();
    const formData = new FormData();
    formData.set("id", "teacher-1");

    const result = await deleteTeacherAction(formData);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(deleteTeacherMock).toHaveBeenCalledWith("teacher-1", transactionClientMock);
    expect(revalidatePathMock).toHaveBeenCalledWith("/teachers");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teachers");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "TEACHER_PROFILE_DELETED",
        targetType: "teacher",
        targetId: "teacher-1",
        before: expect.objectContaining({ id: "teacher-1" }),
        after: expect.objectContaining({ deleted: true }),
        meta: expect.objectContaining({ actorRole: "ADMIN" }),
      }),
      transactionClientMock,
    );
    if (result !== undefined) {
      expect(result).toEqual(expect.objectContaining({ success: true }));
    }
  });

  it("deletes the persisted canonical photo key only after the teacher delete audit commits", async () => {
    const events: string[] = [];
    const photoKey = "public/teachers/admin-1/deleted-photo.webp";
    deleteTeacherMock.mockResolvedValueOnce({
      id: "teacher-1",
      photoUrl: storageUrlForKey(photoKey),
    });
    createAdminAuditLogMock.mockImplementationOnce(async () => {
      events.push("audit");
    });
    prismaMock.$transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => {
      const result = await callback(transactionClientMock);
      events.push("commit");
      return result;
    });
    storageDeleteMock.mockImplementationOnce(async (key: string) => {
      events.push(`cleanup:${key}`);
    });

    const { deleteTeacherAction } = await loadTeachersActions();
    const formData = new FormData();
    formData.set("id", "teacher-1");
    const result = await deleteTeacherAction(formData);

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(storageDeleteMock).toHaveBeenCalledWith(photoKey);
    expect(events).toEqual(["audit", "commit", `cleanup:${photoKey}`]);
  });

  it("keeps audited teacher deletion successful when trusted legacy photo cleanup fails", async () => {
    deleteTeacherMock.mockResolvedValueOnce({
      id: "teacher-1",
      photoUrl: "/uploads/teachers/deleted-photo.webp",
    });
    storageDeleteMock.mockRejectedValueOnce(new Error("cleanup unavailable"));

    const { deleteTeacherAction } = await loadTeachersActions();
    const formData = new FormData();
    formData.set("id", "teacher-1");
    const result = await deleteTeacherAction(formData);

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(storageDeleteMock).toHaveBeenCalledWith("uploads/teachers/deleted-photo.webp");
    expect(createAdminAuditLogMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/teachers");
  });

  it("fails the teacher delete transaction when audit logging fails", async () => {
    deleteTeacherMock.mockResolvedValueOnce({ id: "teacher-1" });
    createAdminAuditLogMock.mockRejectedValueOnce(new Error("Audit unavailable"));

    const { deleteTeacherAction } = await loadTeachersActions();
    const formData = new FormData();
    formData.set("id", "teacher-1");

    const result = await deleteTeacherAction(formData);

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(deleteTeacherMock).toHaveBeenCalledWith("teacher-1", transactionClientMock);
    expect(createAdminAuditLogMock).toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("surfaces repository failures instead of failing silently", async () => {
    createTeacherMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { createTeacherAction } = await loadTeachersActions();
    const result = await createTeacherAction(buildBaseFormData());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/database unavailable|something went wrong|failed/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("does not write an audit log when teacher update mutation fails", async () => {
    updateTeacherMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { updateTeacherAction } = await loadTeachersActions();
    const formData = buildBaseFormData();
    formData.set("id", "teacher-1");

    const result = await updateTeacherAction(formData);

    expect(updateTeacherMock).toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/database unavailable|failed/i),
      }),
    );
  });

  it("does not write an audit log when teacher status mutation fails", async () => {
    setTeacherActiveMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { toggleTeacherStatusAction } = await loadTeachersActions();
    const formData = new FormData();
    formData.set("id", "teacher-1");
    formData.set("isActive", "false");

    const result = await toggleTeacherStatusAction(formData);

    expect(setTeacherActiveMock).toHaveBeenCalledWith("teacher-1", false, transactionClientMock);
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
