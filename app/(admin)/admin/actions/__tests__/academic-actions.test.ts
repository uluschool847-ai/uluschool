import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
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
const transactionClientMock = vi.hoisted(() => ({
  appUser: { findUnique: vi.fn() },
  scheduledClass: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  subject: {
    findUnique: vi.fn(),
  },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof transactionClientMock) => unknown) =>
    callback(transactionClientMock),
  ),
  appUser: { findUnique: vi.fn() },
  scheduledClass: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  subject: {
    findUnique: vi.fn(),
  },
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

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

type AcademicActionsModule = {
  createScheduledClass: (data: unknown) => Promise<{
    success: boolean;
    data?: { id: string; title?: string; teacherId?: string | null };
    error?: unknown;
  }>;
  updateScheduledClass: (
    classId: string,
    data: unknown,
  ) => Promise<{
    success: boolean;
    data?: { id: string; title?: string; teacherId?: string | null };
    error?: unknown;
  }>;
  deleteScheduledClass: (
    classId: string,
    data?: unknown,
  ) => Promise<{
    success: boolean;
    error?: unknown;
  }>;
};

async function loadAcademicActions() {
  const specifier = "@/app/(admin)/admin/actions/academic-actions";
  return import(/* @vite-ignore */ specifier) as Promise<AcademicActionsModule>;
}

function validClassPayload(overrides?: Partial<Record<string, unknown>>) {
  return {
    title: "IGCSE Mathematics - Group A",
    description: "Algebra and functions",
    startAt: new Date("2026-06-01T10:00:00.000Z"),
    endAt: new Date("2026-06-01T11:00:00.000Z"),
    liveLessonUrl: "https://meet.example.com/math-a",
    teacherId: "teacher-1",
    ...overrides,
  };
}

function formatFailureText(result: { error?: unknown }) {
  return JSON.stringify(result.error ?? "");
}

describe("Admin scheduled class actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transactionClientMock) => unknown) =>
        callback(transactionClientMock),
    );
  });

  it("requires ADMIN before creating, updating, or deleting scheduled classes", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const { createScheduledClass } = await loadAcademicActions();
    const result = await createScheduledClass(validClassPayload());

    expect(requireRoleMock).toHaveBeenCalledWith(["ADMIN"]);
    expect(prismaMock.scheduledClass.create).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("rejects invalid class input with visible field-level feedback", async () => {
    const { createScheduledClass } = await loadAcademicActions();
    const result = await createScheduledClass({
      title: "",
      startAt: "not-a-date",
      endAt: "not-a-date",
      liveLessonUrl: "not-a-url",
      teacherId: "teacher-1",
    });

    expect(result.success).toBe(false);
    expect(formatFailureText(result)).toMatch(/title|start|end|url/i);
    expect(prismaMock.scheduledClass.create).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects non-teacher accounts before creating a scheduled class", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: UserRole.STUDENT,
    });

    const { createScheduledClass } = await loadAcademicActions();
    const result = await createScheduledClass(validClassPayload({ teacherId: "student-1" }));

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      select: { id: true, role: true },
    });
    expect(result.success).toBe(false);
    expect(formatFailureText(result)).toMatch(/teacher/i);
    expect(prismaMock.scheduledClass.create).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("creates a scheduled class and writes transaction-safe audit metadata", async () => {
    transactionClientMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    transactionClientMock.scheduledClass.create.mockResolvedValueOnce({
      id: "class-1",
      title: "IGCSE Mathematics - Group A",
      teacherId: "teacher-1",
    });

    const { createScheduledClass } = await loadAcademicActions();
    const result = await createScheduledClass(validClassPayload());

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(transactionClientMock.scheduledClass.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "IGCSE Mathematics - Group A",
        teacher: { connect: { id: "teacher-1" } },
      }),
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: expect.stringMatching(/class.*create|create.*class/i),
        targetType: "scheduled_class",
        targetId: "class-1",
        before: null,
        after: expect.objectContaining({
          title: "IGCSE Mathematics - Group A",
          teacherId: "teacher-1",
        }),
        meta: expect.objectContaining({ teacherId: "teacher-1" }),
      }),
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/classes");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  });

  it("creates a scheduled class with an optional linked subject when subjectId is valid", async () => {
    transactionClientMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    transactionClientMock.subject.findUnique.mockResolvedValueOnce({
      id: "subject-math",
      isActive: true,
    });
    transactionClientMock.scheduledClass.create.mockResolvedValueOnce({
      id: "class-1",
      title: "IGCSE Mathematics - Group A",
      teacherId: "teacher-1",
      subjectId: "subject-math",
    });

    const { createScheduledClass } = await loadAcademicActions();
    const result = await createScheduledClass(validClassPayload({ subjectId: "subject-math" }));

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(transactionClientMock.subject.findUnique).toHaveBeenCalledWith({
      where: { id: "subject-math" },
      select: { id: true, isActive: true },
    });
    expect(transactionClientMock.scheduledClass.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "IGCSE Mathematics - Group A",
        teacher: { connect: { id: "teacher-1" } },
        subjectId: "subject-math",
      }),
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "scheduled_class",
        after: expect.objectContaining({ subjectId: "subject-math" }),
        meta: expect.objectContaining({ subjectId: "subject-math" }),
      }),
      transactionClientMock,
    );
  });

  it("rejects an invalid scheduled class subjectId and does not write audit metadata", async () => {
    transactionClientMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    transactionClientMock.subject.findUnique.mockResolvedValueOnce(null);
    transactionClientMock.scheduledClass.create.mockResolvedValueOnce({
      id: "class-1",
      title: "IGCSE Mathematics - Group A",
      teacherId: "teacher-1",
      subjectId: null,
    });

    const { createScheduledClass } = await loadAcademicActions();
    const result = await createScheduledClass(validClassPayload({ subjectId: "missing-subject" }));

    expect(result.success).toBe(false);
    expect(formatFailureText(result)).toMatch(/subject/i);
    expect(transactionClientMock.scheduledClass.create).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("updates class fields and teacher assignment with before/after audit values", async () => {
    transactionClientMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-1",
      title: "Old Class",
      teacherId: "teacher-old",
      subjectId: "subject-old",
      startAt: new Date("2026-05-01T10:00:00.000Z"),
      endAt: new Date("2026-05-01T11:00:00.000Z"),
    });
    transactionClientMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-2",
      role: UserRole.TEACHER,
    });
    transactionClientMock.subject.findUnique.mockResolvedValueOnce({
      id: "subject-new",
      isActive: true,
    });
    transactionClientMock.scheduledClass.update.mockResolvedValueOnce({
      id: "class-1",
      title: "Updated Class",
      teacherId: "teacher-2",
      subjectId: "subject-new",
    });

    const { updateScheduledClass } = await loadAcademicActions();
    const result = await updateScheduledClass("class-1", {
      title: "Updated Class",
      teacherId: "teacher-2",
      subjectId: "subject-new",
    });

    expect(result.success).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: expect.stringMatching(/class.*update|update.*class/i),
        targetType: "scheduled_class",
        targetId: "class-1",
        before: expect.objectContaining({
          title: "Old Class",
          teacherId: "teacher-old",
          subjectId: "subject-old",
        }),
        after: expect.objectContaining({
          title: "Updated Class",
          teacherId: "teacher-2",
          subjectId: "subject-new",
        }),
      }),
      transactionClientMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/classes");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/classes/class-1/edit");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  });

  it("does not audit when the scheduled class mutation fails", async () => {
    transactionClientMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    transactionClientMock.scheduledClass.create.mockRejectedValueOnce(new Error("DB unavailable"));

    const { createScheduledClass } = await loadAcademicActions();
    const result = await createScheduledClass(validClassPayload());

    expect(result.success).toBe(false);
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("deletes or archives a scheduled class by changing state and auditing the before value", async () => {
    transactionClientMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-1",
      title: "Retired Class",
      teacherId: "teacher-1",
      _count: { students: 0, assignments: 0, courseMaterials: 0, reminders: 0 },
      assignments: [],
    });
    transactionClientMock.scheduledClass.delete.mockResolvedValueOnce({ id: "class-1" });

    const { deleteScheduledClass } = await loadAcademicActions();
    const result = await deleteScheduledClass("class-1");

    expect(result.success).toBe(true);
    expect(
      transactionClientMock.scheduledClass.delete.mock.calls.length +
        transactionClientMock.scheduledClass.update.mock.calls.length,
    ).toBeGreaterThan(0);
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: expect.stringMatching(/class.*delete|delete.*class|archive/i),
        targetType: "scheduled_class",
        targetId: "class-1",
        before: expect.objectContaining({ title: "Retired Class", teacherId: "teacher-1" }),
      }),
      transactionClientMock,
    );
  });

  it("rejects scheduled class delete with dependencies and does not audit failed mutation", async () => {
    transactionClientMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-1",
      title: "Protected Class",
      teacherId: "teacher-1",
      _count: { students: 1, assignments: 1, courseMaterials: 0, reminders: 0 },
      assignments: [{ _count: { submissions: 1 } }],
    });

    const { deleteScheduledClass } = await loadAcademicActions();
    const result = await deleteScheduledClass("class-1");

    expect(result.success).toBe(false);
    expect(formatFailureText(result)).toMatch(/dependencies|cannot be deleted safely/i);
    expect(transactionClientMock.scheduledClass.delete).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("redirects with a visible flash error when a form delete is blocked by dependencies", async () => {
    transactionClientMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-1",
      title: "Protected Class",
      teacherId: "teacher-1",
      _count: { students: 1, assignments: 0, courseMaterials: 0, reminders: 0 },
      assignments: [],
    });
    const formData = new FormData();
    formData.set("flash", "true");
    formData.set("errorRedirect", "/admin/classes?q=Protected");

    const { deleteScheduledClass } = await loadAcademicActions();

    await expect(deleteScheduledClass("class-1", formData)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
      url: expect.stringContaining("classError="),
    });
    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringContaining("Scheduled%20class%20has%20dependencies"),
    );
    expect(transactionClientMock.scheduledClass.delete).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("does not expose raw database errors in form delete flash messages", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(
      new Error("Invalid `prisma.scheduledClass.findUnique()` invocation: Transaction API error"),
    );
    const formData = new FormData();
    formData.set("flash", "true");
    formData.set("errorRedirect", "/admin/classes");

    const { deleteScheduledClass } = await loadAcademicActions();

    await expect(deleteScheduledClass("class-1", formData)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
      url: expect.stringContaining("classError="),
    });
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/classes?classError=Failed%20to%20delete%20scheduled%20class.%20Please%20try%20again.",
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });
});
