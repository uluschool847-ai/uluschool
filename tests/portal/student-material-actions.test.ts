import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSession: { uid: string; role: string; email: string } | null = null;
const requireRoleMock = vi.hoisted(() =>
  vi.fn(async (allowedRoles: string[]) => {
    if (!mockSession) {
      throw new Error("Unauthorized");
    }
    if (!allowedRoles.includes(mockSession.role)) {
      throw new Error("Forbidden");
    }
    return mockSession;
  }),
);

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

const listStudentCourseMaterialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/course-material-repository", () => ({
  listStudentCourseMaterials: listStudentCourseMaterialsMock,
}));

import { getStudentMaterialsAction } from "@/app/portal/student/actions/material-actions";

describe("Student material action integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "student-101", role: "STUDENT", email: "student@test.local" };
  });

  it("uses the UserRole.STUDENT enum guard", async () => {
    listStudentCourseMaterialsMock.mockResolvedValue([]);

    await getStudentMaterialsAction();

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
  });

  it("requires the STUDENT enum guard to fetch materials", async () => {
    const blockedRoles: Array<{ role: string; session: typeof mockSession }> = [
      {
        role: "TEACHER",
        session: { uid: "teacher-1", role: "TEACHER", email: "teacher@test.local" },
      },
      {
        role: "PARENT",
        session: { uid: "parent-1", role: "PARENT", email: "parent@test.local" },
      },
      {
        role: "GUEST",
        session: null,
      },
    ];

    for (const blocked of blockedRoles) {
      mockSession = blocked.session;
      const response = await getStudentMaterialsAction().catch((error: Error) => error);
      const message = response instanceof Error ? response.message : JSON.stringify(response);
      expect(message).toMatch(/forbidden|unauthorized/i);
    }
  });

  it("returns structured student materials attached to class names for STUDENT", async () => {
    listStudentCourseMaterialsMock.mockResolvedValue([
      {
        id: "mat-1",
        title: "Chemistry Bonding Notes",
        description: "Read before next lesson.",
        fileUrl: "https://cdn.school/chem-bonding.pdf",
        safeFileUrl: "https://cdn.school/chem-bonding.pdf",
        attachments: [
          {
            filename: "bonding-lab.pdf",
            href: "/uploads/materials/bonding-lab.pdf",
            mimeType: "application/pdf",
            size: 4096,
          },
        ],
        scheduledClassId: "class-chem-1",
        scheduledClass: {
          id: "class-chem-1",
          title: "IGCSE Chemistry - Group A",
          startAt: new Date("2026-06-10T10:00:00.000Z"),
        },
        classGroup: { id: "group-chem-a", name: "Chemistry Group A" },
        subject: { name: "Chemistry" },
        createdAt: new Date("2026-06-01T09:00:00.000Z"),
        updatedAt: new Date("2026-06-02T09:00:00.000Z"),
      },
    ]);

    const result = await getStudentMaterialsAction();

    expect(listStudentCourseMaterialsMock).toHaveBeenCalledWith("student-101");
    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: "bonding-lab.pdf",
              href: "/uploads/materials/bonding-lab.pdf",
            }),
          ],
          classGroup: { id: "group-chem-a", name: "Chemistry Group A" },
          scheduledClass: expect.objectContaining({ id: "class-chem-1" }),
          subject: { name: "Chemistry" },
          title: "Chemistry Bonding Notes",
          safeFileUrl: "https://cdn.school/chem-bonding.pdf",
        }),
      ]),
    );
    expect(JSON.stringify(result.data)).toMatch(/chemistry|group a/i);
  });

  it("uses session.uid, forwards filters, and ignores client-provided studentId", async () => {
    listStudentCourseMaterialsMock.mockResolvedValue([]);

    await (getStudentMaterialsAction as (filters: Record<string, unknown>) => Promise<unknown>)({
      classGroupId: "group-1",
      scheduledClassId: "lesson-1",
      search: "bonding",
      sort: "subject",
      studentId: "student-other",
      subjectId: "subject-chem",
    });

    expect(listStudentCourseMaterialsMock).toHaveBeenCalledWith("student-101", {
      classGroupId: "group-1",
      scheduledClassId: "lesson-1",
      search: "bonding",
      sort: "subject",
      subjectId: "subject-chem",
    });
    expect(JSON.stringify(listStudentCourseMaterialsMock.mock.calls[0])).not.toContain(
      "student-other",
    );
  });
});
