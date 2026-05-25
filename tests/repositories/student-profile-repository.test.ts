import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type StudentProfileRepositoryModule = {
  getStudentProfile: (studentId: string) => Promise<null | Record<string, unknown>>;
};

function loadStudentProfileRepository() {
  const specifier = "@/lib/repositories/student-profile-repository";
  return import(/* @vite-ignore */ specifier) as Promise<StudentProfileRepositoryModule>;
}

function studentProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    email: "amina@example.com",
    fullName: "Amina Yusuf",
    role: UserRole.STUDENT,
    learningStatus: "ACTIVE",
    isActive: true,
    createdAt: new Date("2026-01-10T09:00:00.000Z"),
    updatedAt: new Date("2026-05-10T09:00:00.000Z"),
    enrolledClassGroups: [
      {
        id: "group-1",
        name: "IGCSE Mathematics A",
        status: "ACTIVE",
        subject: { id: "subject-math", name: "Mathematics" },
        teacher: { id: "teacher-1", fullName: "Jane Teacher" },
      },
    ],
    enrolledClasses: [
      {
        id: "lesson-1",
        title: "Direct algebra support",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        status: "SCHEDULED",
        subject: { id: "subject-math", name: "Mathematics" },
        classGroup: null,
        teacher: { id: "teacher-1", fullName: "Jane Teacher" },
      },
    ],
    ...overrides,
  };
}

describe("student-profile-repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.appUser.findFirst.mockResolvedValue(studentProfile());
  });

  it("exports getStudentProfile as a dedicated student-owned read API", async () => {
    const repository = await loadStudentProfileRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        getStudentProfile: expect.any(Function),
      }),
    );
  });

  it("loads only an active STUDENT profile scoped to the provided session student id", async () => {
    const { getStudentProfile } = await loadStudentProfileRepository();
    const result = await getStudentProfile("student-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "student-1",
          role: UserRole.STUDENT,
        }),
      }),
    );
    const query = JSON.stringify(prismaMock.appUser.findFirst.mock.calls[0][0]);
    expect(query).toContain("student-1");
    expect(query).not.toContain("foreign-student");
    expect(result).toEqual(
      expect.objectContaining({
        id: "student-1",
        email: "amina@example.com",
        fullName: "Amina Yusuf",
        role: UserRole.STUDENT,
        classGroups: expect.arrayContaining([
          expect.objectContaining({
            id: "group-1",
            name: "IGCSE Mathematics A",
            subject: expect.objectContaining({ name: "Mathematics" }),
          }),
        ]),
        directClasses: expect.arrayContaining([
          expect.objectContaining({
            id: "lesson-1",
            title: "Direct algebra support",
          }),
        ]),
      }),
    );
  });

  it("returns null for missing or non-student users", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    const { getStudentProfile } = await loadStudentProfileRepository();
    const result = await getStudentProfile("teacher-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "teacher-1",
          role: UserRole.STUDENT,
        }),
      }),
    );
    expect(result).toBeNull();
  });

  it("does not return class or group membership for another student", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(
      studentProfile({
        enrolledClassGroups: [
          {
            id: "owned-group",
            name: "Owned Mathematics",
            students: [{ id: "student-1" }],
          },
        ],
        enrolledClasses: [
          {
            id: "owned-lesson",
            title: "Owned direct lesson",
            students: [{ id: "student-1" }],
          },
        ],
      }),
    );

    const { getStudentProfile } = await loadStudentProfileRepository();
    const result = await getStudentProfile("student-1");

    expect(JSON.stringify(result)).not.toContain("foreign-student");
    expect(JSON.stringify(result)).not.toContain("Foreign Student");
    expect(JSON.stringify(result)).not.toContain("foreign-group");
    expect(JSON.stringify(result)).not.toContain("foreign-lesson");
  });
});
