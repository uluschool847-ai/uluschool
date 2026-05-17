import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSession: { uid: string; role: string; email: string } | null = null;

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    if (!mockSession) {
      throw new Error("Unauthorized");
    }
    if (!allowedRoles.includes(mockSession.role)) {
      throw new Error("Forbidden");
    }
    return mockSession;
  }),
}));

const listStudentCourseMaterialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/portal-repository", () => ({
  listStudentCourseMaterials: listStudentCourseMaterialsMock,
}));

import { getStudentMaterialsAction } from "@/app/portal/student/actions/material-actions";

describe("Student material action integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "student-101", role: "STUDENT", email: "student@test.local" };
  });

  it("allows only STUDENT role to fetch materials", async () => {
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
        scheduledClassId: "class-chem-1",
        scheduledClass: { title: "IGCSE Chemistry - Group A" },
        subject: { name: "Chemistry" },
      },
    ]);

    const result = await getStudentMaterialsAction();

    expect(listStudentCourseMaterialsMock).toHaveBeenCalledWith("student-101");
    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Chemistry Bonding Notes",
          fileUrl: "https://cdn.school/chem-bonding.pdf",
        }),
      ]),
    );
    expect(JSON.stringify(result.data)).toMatch(/chemistry|group a/i);
  });
});
