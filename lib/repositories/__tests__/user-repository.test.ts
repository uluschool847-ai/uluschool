import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type UserRepositoryModule = {
  findUserById: (userId: string) => Promise<{
    id: string;
    email: string;
    fullName: string;
    role: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
    isActive: boolean;
    learningStatus?: "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE" | null;
    phoneWhatsapp: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null>;
  listUsersByRole: (role: UserRole) => Promise<
    Array<{
      id: string;
      fullName: string;
      email: string | null;
      phoneWhatsapp: string | null;
    }>
  >;
  getStudentProfile: (studentId: string) => Promise<{
    student: {
      id: string;
      role: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
      name: string;
    };
    enrolledClasses: Array<{
      id: string;
      title: string;
      teacher?: { id: string; fullName: string } | null;
    }>;
    recentSubmissions: Array<{
      id: string;
      assignment: { id: string; title: string };
    }>;
  }>;
};

async function loadUserRepository() {
  const specifier = "@/lib/repositories/user-repository";
  return import(/* @vite-ignore */ specifier) as Promise<UserRepositoryModule>;
}

describe("user-repository lookup contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("findUserById selects the edit-page contract including phoneWhatsapp and timestamps", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      learningStatus: "TRIAL",
      phoneWhatsapp: "+254700000000",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { findUserById } = await loadUserRepository();
    const result = await findUserById("student-1");

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        learningStatus: true,
        phoneWhatsapp: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(result).toEqual({
      id: "student-1",
      email: "alice.student@example.com",
      fullName: "Alice Student",
      role: "STUDENT",
      isActive: true,
      learningStatus: "TRIAL",
      phoneWhatsapp: "+254700000000",
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });

  it("listUsersByRole returns active parent candidates ordered by name", async () => {
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      {
        id: "parent-1",
        fullName: "Mary Parent",
        email: "mary.parent@example.com",
        phoneWhatsapp: "+254700000001",
      },
      {
        id: "parent-2",
        fullName: "Zara Parent",
        email: "zara.parent@example.com",
        phoneWhatsapp: null,
      },
    ]);

    const { listUsersByRole } = await loadUserRepository();
    const result = await listUsersByRole(UserRole.PARENT);

    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith({
      where: { role: UserRole.PARENT, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneWhatsapp: true,
      },
      orderBy: { fullName: "asc" },
    });
    expect(result).toEqual([
      {
        id: "parent-1",
        fullName: "Mary Parent",
        email: "mary.parent@example.com",
        phoneWhatsapp: "+254700000001",
      },
      {
        id: "parent-2",
        fullName: "Zara Parent",
        email: "zara.parent@example.com",
        phoneWhatsapp: null,
      },
    ]);
  });

  it("getStudentProfile keeps enrolled classes available to student-facing consumers", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      fullName: "Alice Student",
      enrolledClasses: [
        {
          id: "class-1",
          title: "Mathematics 8A",
        },
      ],
      submissions: [
        {
          id: "submission-1",
          assignment: {
            id: "assignment-1",
            title: "Homework 1",
          },
        },
      ],
    });

    const { getStudentProfile } = await loadUserRepository();
    const result = await getStudentProfile("student-1");

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      include: {
        enrolledClasses: true,
        submissions: {
          include: { assignment: true },
          orderBy: { submittedAt: "desc" },
          take: 5,
        },
      },
    });
    expect(result).toEqual({
      student: {
        id: "student-1",
        role: "STUDENT",
        name: "Alice Student",
      },
      enrolledClasses: [
        expect.objectContaining({
          id: "class-1",
          title: "Mathematics 8A",
        }),
      ],
      recentSubmissions: [
        expect.objectContaining({
          id: "submission-1",
          assignment: expect.objectContaining({
            id: "assignment-1",
            title: "Homework 1",
          }),
        }),
      ],
    });
  });

  it("getStudentProfile preserves empty relation arrays for student-facing consumers", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-2",
      role: "STUDENT",
      fullName: "Bob Student",
      enrolledClasses: [],
      submissions: [],
    });

    const { getStudentProfile } = await loadUserRepository();
    const result = await getStudentProfile("student-2");

    expect(result).toEqual({
      student: {
        id: "student-2",
        role: "STUDENT",
        name: "Bob Student",
      },
      enrolledClasses: [],
      recentSubmissions: [],
    });
  });
});
