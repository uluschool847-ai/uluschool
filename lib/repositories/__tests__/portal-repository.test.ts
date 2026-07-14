import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeStorageKey, storageUrlForKey } from "@/lib/storage/storage-url";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  scheduledClass: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  assignment: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  classGroup: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  studentProgress: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  submission: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

const hashPasswordMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: hashPasswordMock,
}));

type StudentLearningStatus = "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE";
type AdminRegistrySort = "nameAsc" | "nameDesc" | "createdAtDesc" | "createdAtAsc";

type PortalRepositoryModule = {
  findAllUsers: (filters?: {
    page?: number;
    limit?: number;
    role?: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
    searchQuery?: string;
    sort?: AdminRegistrySort;
  }) => Promise<{
    items: Array<{
      id: string;
      email: string;
      fullName: string;
      role: string;
      isActive: boolean;
    }>;
    totalCount: number;
    totalPages: number;
  }>;
  createUser: (data: {
    email: string;
    fullName: string;
    role: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
    phoneWhatsapp?: string;
  }) => Promise<{
    user: {
      id: string;
      email: string;
      fullName: string;
      role: string;
      isActive: boolean;
      learningStatus?: StudentLearningStatus;
    };
    temporaryPassword: string;
    mustChangePassword: true;
  }>;
  updateUserProfile: (input: {
    userId: string;
    fullName: string;
    email: string;
    phoneWhatsapp?: string | null;
  }) => Promise<{
    id: string;
    email: string;
    fullName: string;
    phoneWhatsapp: string | null;
  }>;
  updateUserRole: (
    userId: string,
    newRole: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT",
    actorId?: string,
  ) => Promise<{
    id: string;
    role: string;
  }>;
  toggleUserStatus: (
    userId: string,
    isActive: boolean,
    actorId?: string,
  ) => Promise<{
    id: string;
    isActive: boolean;
  }>;
  updateStudentLearningStatus: (
    studentId: string,
    learningStatus: StudentLearningStatus,
  ) => Promise<{
    id: string;
    role: string;
    isActive: boolean;
    learningStatus: StudentLearningStatus;
  }>;
  getLinkedParents: (studentId: string) => Promise<
    Array<{
      id: string;
      fullName: string;
      email: string | null;
    }>
  >;
  linkStudentParent: (studentId: string, parentId: string) => Promise<unknown>;
  unlinkStudentParent: (studentId: string, parentId: string) => Promise<unknown>;
  getEnrolledClasses: (studentId: string) => Promise<
    Array<{
      id: string;
      title: string;
      startAt: Date;
      teacher: { id: string; fullName: string } | null;
    }>
  >;
  listAvailableClassesForStudentEnrollment: (studentId: string) => Promise<
    Array<{
      id: string;
      title: string;
      startAt: Date;
      teacher: { id: string; fullName: string } | null;
    }>
  >;
  linkStudentClass: (studentId: string, classId: string) => Promise<unknown>;
  unlinkStudentClass: (studentId: string, classId: string) => Promise<unknown>;
  getStudentProgress: (studentId: string) => Promise<
    Array<{
      id: string;
      gradeLevel: string;
      teacherNotes: string;
      recordedAt: Date;
      subject: { name: string };
    }>
  >;
  getAdminStudents: (filters?: {
    page?: number;
    limit?: number;
    searchQuery?: string;
    isActive?: boolean;
    learningStatus?: StudentLearningStatus;
    parentLinked?: boolean;
    classLinked?: boolean;
    sort?: AdminRegistrySort;
  }) => Promise<{
    items: Array<{
      id: string;
      email: string;
      fullName: string;
      isActive: boolean;
      learningStatus: StudentLearningStatus;
      parents: Array<{
        id: string;
        fullName: string;
        email?: string | null;
      }>;
      enrolledClasses: Array<{
        id: string;
        title: string;
        teacher?: { id: string; fullName: string } | null;
      }>;
      derivedTeachers: Array<{
        id: string;
        fullName: string;
      }>;
      createdAt: Date;
      updatedAt: Date;
    }>;
    totalCount: number;
    totalPages: number;
  }>;
  getAdminParents: (filters?: {
    page?: number;
    limit?: number;
    searchQuery?: string;
    isActive?: boolean;
    studentLinked?: boolean;
    sort?: AdminRegistrySort;
  }) => Promise<{
    items: Array<{
      id: string;
      email: string;
      fullName: string;
      phoneWhatsapp: string | null;
      isActive: boolean;
      children: Array<{
        id: string;
        fullName: string;
        email?: string | null;
        isActive?: boolean;
      }>;
      createdAt: Date;
      updatedAt: Date;
    }>;
    totalCount: number;
    totalPages: number;
  }>;
  getAdminParentById: (parentId: string) => Promise<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    phoneWhatsapp: string | null;
    isActive: boolean;
    children: Array<{
      id: string;
      fullName: string;
      email?: string | null;
      isActive?: boolean;
    }>;
    createdAt: Date;
    updatedAt: Date;
  } | null>;
  linkParentStudent: (parentId: string, studentId: string) => Promise<unknown>;
  unlinkParentStudent: (parentId: string, studentId: string) => Promise<unknown>;
  getParentScopedStudentData: (params: { parentId: string; childId: string }) => Promise<{
    childId: string;
    childName: string;
    enrolledClasses: unknown[];
    submissions: unknown[];
    progress: unknown[];
  }>;
  listParentScopedSubmissions: (params: {
    parentId: string;
    childId: string;
  }) => Promise<unknown[]>;
  getTeacherDashboardData: (teacherId: string) => Promise<{
    metrics: {
      myClasses: number;
      activeAssignments: number;
      pendingSubmissions: number;
      upcomingLessons: number;
    };
    classes: Array<{
      id: string;
      title: string;
      studentCount: number;
    }>;
    activeAssignments: Array<{
      id: string;
      title: string;
      scheduledClassTitle: string;
      submissionCount: number;
      pendingSubmissionCount: number;
    }>;
    recentPendingSubmissions: Array<{
      id: string;
      studentName: string;
      assignmentTitle: string;
      classTitle: string;
    }>;
    upcomingLessons: Array<{
      id: string;
      title: string;
      studentCount: number;
    }>;
  }>;
  listTeacherHomework: (teacherId: string) => Promise<unknown[]>;
  listSubmissionsForAssignmentByTeacher: (input: {
    teacherId: string;
    assignmentId: string;
  }) => Promise<unknown[]>;
  gradeSubmissionForTeacher: (input: {
    teacherId: string;
    submissionId: string;
    grade: number;
    feedback?: string | null;
  }) => Promise<unknown>;
  createProgressNote: (input: {
    teacherId: string;
    studentId: string;
    subjectId: string;
    content: string;
    performanceLevel: "EXCELLENT" | "GOOD" | "STRUGGLING";
  }) => Promise<unknown>;
  listProgressNotesForTeacherStudentSubject: (input: {
    teacherId: string;
    studentId: string;
    subjectId: string;
  }) => Promise<unknown[]>;
};

async function loadPortalRepository() {
  const specifier = "@/lib/repositories/portal-repository";
  return import(/* @vite-ignore */ specifier) as Promise<PortalRepositoryModule>;
}

describe("portal-repository admin user management", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hashPasswordMock.mockResolvedValue("hashed-default-password");
  });

  it("findAllUsers filters by role and search query with pagination metadata", async () => {
    prismaMock.appUser.count.mockResolvedValueOnce(2);
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      {
        id: "teacher-1",
        email: "sarah.teacher@example.com",
        fullName: "Sarah Teacher",
        role: "TEACHER",
        isActive: true,
      },
      {
        id: "teacher-2",
        email: "sam.teacher@example.com",
        fullName: "Sam Teacher",
        role: "TEACHER",
        isActive: true,
      },
    ]);

    const { findAllUsers } = await loadPortalRepository();
    const result = await findAllUsers({
      page: 1,
      limit: 10,
      role: "TEACHER",
      searchQuery: "teacher",
    });

    expect(prismaMock.appUser.count).toHaveBeenCalledWith({
      where: {
        role: "TEACHER",
        OR: [
          { fullName: { contains: "teacher", mode: "insensitive" } },
          { email: { contains: "teacher", mode: "insensitive" } },
        ],
      },
    });
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: "TEACHER" }),
        skip: 0,
        take: 10,
      }),
    );
    expect(result).toEqual({
      items: expect.arrayContaining([
        expect.objectContaining({ id: "teacher-1", role: "TEACHER" }),
        expect.objectContaining({ id: "teacher-2", role: "TEACHER" }),
      ]),
      totalCount: 2,
      totalPages: 1,
    });
  });

  it("findAllUsers returns an empty result set for searches without matches", async () => {
    prismaMock.appUser.count.mockResolvedValueOnce(0);
    prismaMock.appUser.findMany.mockResolvedValueOnce([]);

    const { findAllUsers } = await loadPortalRepository();
    const result = await findAllUsers({ page: 1, limit: 10, searchQuery: "nobody" });

    expect(result).toEqual({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });
  });

  it("findAllUsers applies explicit sort before pagination", async () => {
    prismaMock.appUser.count.mockResolvedValueOnce(0);
    prismaMock.appUser.findMany.mockResolvedValueOnce([]);

    const { findAllUsers } = await loadPortalRepository();
    await findAllUsers({ page: 2, limit: 20, sort: "createdAtDesc" });

    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { fullName: "asc" }],
        skip: 20,
        take: 20,
      }),
    );
  });

  it("createUser issues a temporary credential and requires a password change for a new student", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    prismaMock.appUser.create.mockResolvedValueOnce({
      id: "student-1",
      email: "student@example.com",
      fullName: "Student One",
      role: "STUDENT",
      isActive: true,
      learningStatus: "ACTIVE",
    });

    const { createUser } = await loadPortalRepository();
    const result = await createUser({
      email: "student@example.com",
      fullName: "Student One",
      role: "STUDENT",
    });

    expect(hashPasswordMock).toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9_-]{20}$/));
    expect(prismaMock.appUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "student@example.com",
        fullName: "Student One",
        role: "STUDENT",
        passwordHash: "hashed-default-password",
        mustChangePassword: true,
        isActive: true,
        learningStatus: "ACTIVE",
      }),
    });
    expect(result).toEqual({
      user: expect.objectContaining({ id: "student-1", email: "student@example.com" }),
      temporaryPassword: expect.stringMatching(/^[A-Za-z0-9_-]{20}$/),
      mustChangePassword: true,
    });
  });

  it("createUser does not overload account access when defaulting a new student lifecycle status", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    prismaMock.appUser.create.mockResolvedValueOnce({
      id: "student-1",
      email: "student@example.com",
      fullName: "Student One",
      role: "STUDENT",
      isActive: true,
      learningStatus: "ACTIVE",
    });

    const { createUser } = await loadPortalRepository();
    const result = await createUser({
      email: "student@example.com",
      fullName: "Student One",
      role: "STUDENT",
    });

    expect(prismaMock.appUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: "STUDENT",
        isActive: true,
        learningStatus: "ACTIVE",
      }),
    });
    expect(result.user).toEqual(
      expect.objectContaining({
        role: "STUDENT",
        isActive: true,
        learningStatus: "ACTIVE",
      }),
    );
  });

  it("createUser does not write student lifecycle status when creating a parent account", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    prismaMock.appUser.create.mockResolvedValueOnce({
      id: "parent-1",
      email: "parent@example.com",
      fullName: "Parent User",
      role: "PARENT",
      isActive: true,
    });

    const { createUser } = await loadPortalRepository();
    const result = await createUser({
      email: "parent@example.com",
      fullName: "Parent User",
      role: "PARENT",
    });

    const createArgs = prismaMock.appUser.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toEqual(
      expect.objectContaining({
        email: "parent@example.com",
        fullName: "Parent User",
        role: "PARENT",
        isActive: true,
      }),
    );
    expect(createArgs?.data).not.toHaveProperty("learningStatus");
    expect(result.user).toEqual(
      expect.objectContaining({
        role: "PARENT",
        isActive: true,
      }),
    );
  });

  it.each(["TEACHER", "ADMIN"] as const)(
    "createUser keeps learningStatus student-only when creating a %s account",
    async (role) => {
      prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
      prismaMock.appUser.create.mockResolvedValueOnce({
        id: `${role.toLowerCase()}-1`,
        email: `${role.toLowerCase()}@example.com`,
        fullName: `${role} User`,
        role,
        isActive: true,
      });

      const { createUser } = await loadPortalRepository();
      const result = await createUser({
        email: `${role.toLowerCase()}@example.com`,
        fullName: `${role} User`,
        role,
      });

      const createArgs = prismaMock.appUser.create.mock.calls[0]?.[0];
      expect(createArgs?.data).toEqual(
        expect.objectContaining({
          email: `${role.toLowerCase()}@example.com`,
          fullName: `${role} User`,
          role,
          isActive: true,
        }),
      );
      expect(createArgs?.data).not.toHaveProperty("learningStatus");
      expect(result.user).toEqual(
        expect.objectContaining({
          role,
          isActive: true,
        }),
      );
    },
  );

  it("createUser rejects duplicate emails before creating a new account", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "existing-user",
      email: "duplicate@example.com",
    });

    const { createUser } = await loadPortalRepository();

    await expect(
      createUser({
        email: "duplicate@example.com",
        fullName: "Duplicate User",
        role: "PARENT",
      }),
    ).rejects.toThrow(/duplicate|already exists|email/i);
    expect(prismaMock.appUser.create).not.toHaveBeenCalled();
  });

  it("updateUserProfile updates only allowed AppUser profile fields for a student account", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      email: "student@example.com",
      fullName: "Student One",
      role: "STUDENT",
      phoneWhatsapp: "+254700000000",
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    prismaMock.appUser.update.mockResolvedValueOnce({
      id: "student-1",
      email: "student.updated@example.com",
      fullName: "Student Updated",
      phoneWhatsapp: "+254711111111",
    });

    const { updateUserProfile } = await loadPortalRepository();
    const result = await updateUserProfile({
      userId: "student-1",
      fullName: "Student Updated",
      email: "student.updated@example.com",
      phoneWhatsapp: "+254711111111",
    });

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      select: {
        id: true,
        role: true,
      },
    });
    expect(prismaMock.appUser.findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: "student.updated@example.com" },
      select: {
        id: true,
      },
    });
    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: {
        fullName: "Student Updated",
        email: "student.updated@example.com",
        phoneWhatsapp: "+254711111111",
      },
    });
    expect(result).toEqual({
      id: "student-1",
      email: "student.updated@example.com",
      fullName: "Student Updated",
      phoneWhatsapp: "+254711111111",
    });
  });

  it("updateUserProfile rejects duplicate emails before updating the student profile", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      email: "student@example.com",
      fullName: "Student One",
      role: "STUDENT",
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "other-user",
      email: "student.updated@example.com",
    });

    const { updateUserProfile } = await loadPortalRepository();

    await expect(
      updateUserProfile({
        userId: "student-1",
        fullName: "Student Updated",
        email: "student.updated@example.com",
        phoneWhatsapp: "+254711111111",
      }),
    ).rejects.toThrow(/already exists|duplicate/i);

    expect(prismaMock.appUser.update).not.toHaveBeenCalled();
  });

  it("updateUserProfile maps Prisma unique constraint failures to a duplicate email error", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      email: "student@example.com",
      fullName: "Student One",
      role: "STUDENT",
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    prismaMock.appUser.update.mockRejectedValueOnce({
      code: "P2002",
      message: "Unique constraint failed on the fields: (`email`)",
    });

    const { updateUserProfile } = await loadPortalRepository();

    await expect(
      updateUserProfile({
        userId: "student-1",
        fullName: "Student Updated",
        email: "student.updated@example.com",
        phoneWhatsapp: "+254711111111",
      }),
    ).rejects.toThrow(/already exists|duplicate/i);

    expect(prismaMock.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "student-1" },
        data: expect.objectContaining({
          email: "student.updated@example.com",
        }),
      }),
    );
  });

  it("getLinkedParents returns the linked parent accounts for a student", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      fullName: "Alice Student",
      parents: [
        {
          id: "parent-1",
          fullName: "Mary Parent",
          email: "mary.parent@example.com",
        },
        {
          id: "parent-2",
          fullName: "John Parent",
          email: null,
        },
      ],
    });

    const { getLinkedParents } = await loadPortalRepository();
    const result = await getLinkedParents("student-1");

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      include: {
        parents: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
    expect(result).toEqual([
      {
        id: "parent-1",
        fullName: "Mary Parent",
        email: "mary.parent@example.com",
      },
      {
        id: "parent-2",
        fullName: "John Parent",
        email: null,
      },
    ]);
  });

  it("linkStudentParent connects a parent to a student and prevents duplicate links", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      parents: [],
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
    });
    prismaMock.appUser.update.mockResolvedValueOnce({
      id: "student-1",
    });

    const { linkStudentParent } = await loadPortalRepository();
    await linkStudentParent("student-1", "parent-1");

    expect(prismaMock.appUser.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: "student-1" },
      select: {
        id: true,
        role: true,
        parents: {
          select: {
            id: true,
          },
        },
      },
    });
    expect(prismaMock.appUser.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: "parent-1" },
      select: {
        id: true,
        role: true,
      },
    });
    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: {
        parents: {
          connect: { id: "parent-1" },
        },
      },
    });

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      parents: [
        {
          id: "parent-1",
        },
      ],
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
    });

    await expect(linkStudentParent("student-1", "parent-1")).rejects.toThrow(
      /already linked|duplicate/i,
    );
  });

  it("linkStudentParent rejects missing parent targets before linking", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      parents: [],
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);

    const { linkStudentParent } = await loadPortalRepository();

    await expect(linkStudentParent("student-1", "missing-parent")).rejects.toThrow(
      /parent account not found|not allowed|invalid/i,
    );
    expect(prismaMock.appUser.update).not.toHaveBeenCalled();
  });

  it("linkStudentParent rejects non-parent accounts and unlinkStudentParent removes an existing link", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      parents: [
        {
          id: "parent-1",
        },
      ],
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: "TEACHER",
    });

    const { linkStudentParent, unlinkStudentParent } = await loadPortalRepository();

    await expect(linkStudentParent("student-1", "teacher-1")).rejects.toThrow(
      /parent|role|not allowed|invalid/i,
    );
    expect(prismaMock.appUser.update).not.toHaveBeenCalled();

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      parents: [
        {
          id: "parent-1",
        },
      ],
    });
    prismaMock.appUser.update.mockResolvedValueOnce({
      id: "student-1",
    });

    await unlinkStudentParent("student-1", "parent-1");

    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: {
        parents: {
          disconnect: { id: "parent-1" },
        },
      },
    });
  });

  it("updateUserRole updates a normal user role safely", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: "TEACHER",
    });
    prismaMock.appUser.update.mockResolvedValueOnce({
      id: "teacher-1",
      role: "ADMIN",
    });

    const { updateUserRole } = await loadPortalRepository();
    const result = await updateUserRole("teacher-1", "ADMIN", "admin-1");

    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      data: { role: "ADMIN" },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "teacher-1",
        role: "ADMIN",
        before: { id: "teacher-1", role: "TEACHER" },
        after: { id: "teacher-1", role: "ADMIN" },
      }),
    );
  });

  it("updateUserRole prevents demoting the last admin account", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "admin-1",
      role: "ADMIN",
    });
    prismaMock.appUser.count.mockResolvedValueOnce(1);

    const { updateUserRole } = await loadPortalRepository();

    await expect(updateUserRole("admin-1", "TEACHER", "admin-1")).rejects.toThrow(
      /last admin|at least one admin|cannot demote/i,
    );
    expect(prismaMock.appUser.update).not.toHaveBeenCalled();
  });

  it("toggleUserStatus deactivates a normal account", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      isActive: true,
    });
    prismaMock.appUser.update.mockResolvedValueOnce({
      id: "student-1",
      isActive: false,
    });

    const { toggleUserStatus } = await loadPortalRepository();
    const result = await toggleUserStatus("student-1", false, "admin-1");

    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { isActive: false },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "student-1",
        isActive: false,
        before: { id: "student-1", isActive: true },
        after: { id: "student-1", isActive: false },
      }),
    );
  });

  it("updateStudentLearningStatus changes only the student lifecycle status without deleting or disabling the account", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      email: "student@example.com",
      fullName: "Student One",
      role: "STUDENT",
      isActive: true,
      learningStatus: "ACTIVE",
    });
    prismaMock.appUser.update.mockResolvedValueOnce({
      id: "student-1",
      email: "student@example.com",
      fullName: "Student One",
      role: "STUDENT",
      isActive: true,
      learningStatus: "PAUSED",
    });

    const { updateStudentLearningStatus } = await loadPortalRepository();
    const result = await updateStudentLearningStatus("student-1", "PAUSED");

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      select: expect.objectContaining({
        id: true,
        role: true,
        isActive: true,
        learningStatus: true,
      }),
    });
    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { learningStatus: "PAUSED" },
      select: expect.objectContaining({
        id: true,
        role: true,
        isActive: true,
        learningStatus: true,
      }),
    });
    expect(prismaMock.appUser.delete).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: "student-1",
        role: "STUDENT",
        isActive: true,
        learningStatus: "PAUSED",
      }),
    );
  });

  it("updateStudentLearningStatus rejects non-student targets before mutating lifecycle status", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      isActive: true,
      learningStatus: null,
    });

    const { updateStudentLearningStatus } = await loadPortalRepository();

    await expect(updateStudentLearningStatus("parent-1", "PAUSED")).rejects.toThrow(
      /student|role|not allowed|invalid/i,
    );
    expect(prismaMock.appUser.update).not.toHaveBeenCalled();
    expect(prismaMock.appUser.delete).not.toHaveBeenCalled();
  });

  it("toggleUserStatus prevents an admin from deactivating their own account", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "admin-1",
      role: "ADMIN",
      isActive: true,
    });

    const { toggleUserStatus } = await loadPortalRepository();

    await expect(toggleUserStatus("admin-1", false, "admin-1")).rejects.toThrow(
      /self|own account|cannot deactivate/i,
    );
    expect(prismaMock.appUser.update).not.toHaveBeenCalled();
  });

  it("getAdminStudents applies the full registry filter set for search, active status, and linked relations", async () => {
    prismaMock.appUser.count.mockResolvedValueOnce(0);
    prismaMock.appUser.findMany.mockResolvedValueOnce([]);

    const { getAdminStudents } = await loadPortalRepository();
    const result = await getAdminStudents({
      page: 3,
      limit: 15,
      searchQuery: "bob@example.com",
      isActive: false,
      parentLinked: false,
      classLinked: true,
      sort: "nameDesc",
    });

    expect(prismaMock.appUser.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        role: "STUDENT",
        isActive: false,
        OR: [
          { fullName: { contains: "bob@example.com", mode: "insensitive" } },
          { email: { contains: "bob@example.com", mode: "insensitive" } },
        ],
        parents: { none: {} },
        enrolledClasses: { some: {} },
      }),
    });
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "STUDENT",
          isActive: false,
          parents: { none: {} },
          enrolledClasses: { some: {} },
        }),
        orderBy: [{ fullName: "desc" }, { email: "desc" }],
        skip: 30,
        take: 15,
        include: expect.objectContaining({
          parents: expect.any(Object),
          enrolledClasses: expect.any(Object),
        }),
      }),
    );
    expect(result).toEqual({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });
  });

  it("getAdminStudents filters by student lifecycle status separately from account access status", async () => {
    prismaMock.appUser.count.mockResolvedValueOnce(1);
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      {
        id: "student-paused",
        email: "paused.student@example.com",
        fullName: "Paused Student",
        role: "STUDENT",
        isActive: true,
        learningStatus: "PAUSED",
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
        parents: [],
        enrolledClasses: [],
      },
    ]);

    const { getAdminStudents } = await loadPortalRepository();
    const result = await getAdminStudents({
      page: 1,
      limit: 20,
      isActive: true,
      learningStatus: "PAUSED",
    });

    expect(prismaMock.appUser.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        role: "STUDENT",
        isActive: true,
        learningStatus: "PAUSED",
      }),
    });
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "STUDENT",
          isActive: true,
          learningStatus: "PAUSED",
        }),
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "student-paused",
        isActive: true,
        learningStatus: "PAUSED",
      }),
    ]);
  });

  it("getAdminStudents maps parents, enrolled classes, derived teachers, and timestamps", async () => {
    prismaMock.appUser.count.mockResolvedValueOnce(2);
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      {
        id: "student-1",
        email: "alice.student@example.com",
        fullName: "Alice Student",
        role: "STUDENT",
        isActive: true,
        learningStatus: "TRIAL",
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
        parents: [
          {
            id: "parent-1",
            fullName: "Mary Parent",
            email: "mary.parent@example.com",
          },
        ],
        enrolledClasses: [
          {
            id: "class-1",
            title: "Mathematics 8A",
            teacher: { id: "teacher-1", fullName: "Jane Doe" },
          },
          {
            id: "class-2",
            title: "Biology 8A",
            teacher: { id: "teacher-2", fullName: "John Smith" },
          },
          {
            id: "class-3",
            title: "Mathematics 8B",
            teacher: { id: "teacher-1", fullName: "Jane Doe" },
          },
        ],
      },
      {
        id: "student-2",
        email: "bob.student@example.com",
        fullName: "Bob Student",
        role: "STUDENT",
        isActive: false,
        learningStatus: "INACTIVE",
        createdAt: new Date("2026-05-02T10:00:00.000Z"),
        updatedAt: new Date("2026-05-05T10:00:00.000Z"),
        parents: [],
        enrolledClasses: [],
      },
    ]);

    const { getAdminStudents } = await loadPortalRepository();
    const result = await getAdminStudents({
      page: 1,
      limit: 20,
    });

    expect(prismaMock.appUser.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        role: "STUDENT",
      }),
    });
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "STUDENT",
        }),
        orderBy: expect.arrayContaining([expect.objectContaining({ fullName: "asc" })]),
        skip: 0,
        take: 20,
        include: expect.objectContaining({
          parents: expect.any(Object),
          enrolledClasses: expect.any(Object),
        }),
      }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: "student-1",
          email: "alice.student@example.com",
          fullName: "Alice Student",
          isActive: true,
          learningStatus: "TRIAL",
          parents: expect.arrayContaining([
            expect.objectContaining({
              fullName: "Mary Parent",
              email: "mary.parent@example.com",
            }),
          ]),
          enrolledClasses: expect.arrayContaining([
            expect.objectContaining({ title: "Mathematics 8A" }),
            expect.objectContaining({ title: "Biology 8A" }),
            expect.objectContaining({ title: "Mathematics 8B" }),
          ]),
          derivedTeachers: expect.arrayContaining([
            expect.objectContaining({ fullName: "Jane Doe" }),
            expect.objectContaining({ fullName: "John Smith" }),
          ]),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
        expect.objectContaining({
          id: "student-2",
          email: "bob.student@example.com",
          fullName: "Bob Student",
          isActive: false,
          learningStatus: "INACTIVE",
          parents: [],
          enrolledClasses: [],
          derivedTeachers: [],
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      ],
      totalCount: 2,
      totalPages: 1,
    });
  });

  it("getAdminStudents returns an empty registry result when no students match", async () => {
    prismaMock.appUser.count.mockResolvedValueOnce(0);
    prismaMock.appUser.findMany.mockResolvedValueOnce([]);

    const { getAdminStudents } = await loadPortalRepository();
    const result = await getAdminStudents({
      page: 1,
      limit: 20,
      searchQuery: "missing",
    });

    expect(result).toEqual({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });
  });

  it("getEnrolledClasses returns enrolled classes with title, start time, and teacher metadata", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      enrolledClasses: [
        {
          id: "class-1",
          title: "Mathematics 8A",
          startAt: new Date("2026-05-06T09:00:00.000Z"),
          teacher: {
            id: "teacher-1",
            fullName: "Jane Doe",
          },
        },
        {
          id: "class-2",
          title: "Physics 8A",
          startAt: new Date("2026-05-07T11:00:00.000Z"),
          teacher: {
            id: "teacher-2",
            fullName: "John Smith",
          },
        },
      ],
    });

    const { getEnrolledClasses } = await loadPortalRepository();
    const result = await getEnrolledClasses("student-1");

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      include: {
        enrolledClasses: {
          include: {
            teacher: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "class-1",
        title: "Mathematics 8A",
        startAt: expect.any(Date),
        teacher: expect.objectContaining({
          id: "teacher-1",
          fullName: "Jane Doe",
        }),
      }),
      expect.objectContaining({
        id: "class-2",
        title: "Physics 8A",
        startAt: expect.any(Date),
        teacher: expect.objectContaining({
          id: "teacher-2",
          fullName: "John Smith",
        }),
      }),
    ]);
  });

  it("getEnrolledClasses returns an empty array when the student has no class enrollments", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      enrolledClasses: [],
    });

    const { getEnrolledClasses } = await loadPortalRepository();
    const result = await getEnrolledClasses("student-1");

    expect(result).toEqual([]);
  });

  it("listAvailableClassesForStudentEnrollment excludes enrolled classes and keeps teacher metadata", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "class-2",
        title: "Physics 8A",
        startAt: new Date("2026-05-07T11:00:00.000Z"),
        teacher: {
          id: "teacher-2",
          fullName: "John Smith",
        },
      },
      {
        id: "class-3",
        title: "Chemistry 8A",
        startAt: new Date("2026-05-08T13:30:00.000Z"),
        teacher: {
          id: "teacher-3",
          fullName: "Alice Brown",
        },
      },
    ]);

    const { listAvailableClassesForStudentEnrollment } = await loadPortalRepository();
    const result = await listAvailableClassesForStudentEnrollment("student-1");

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith({
      where: {
        students: {
          none: {
            id: "student-1",
          },
        },
      },
      include: {
        teacher: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        startAt: "asc",
      },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "class-2",
        title: "Physics 8A",
        startAt: expect.any(Date),
        teacher: expect.objectContaining({
          id: "teacher-2",
          fullName: "John Smith",
        }),
      }),
      expect.objectContaining({
        id: "class-3",
        title: "Chemistry 8A",
        startAt: expect.any(Date),
        teacher: expect.objectContaining({
          id: "teacher-3",
          fullName: "Alice Brown",
        }),
      }),
    ]);
  });

  it("linkStudentClass connects the student to the class and prevents duplicate enrollments", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      enrolledClasses: [],
    });
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-1",
      title: "Mathematics 8A",
      startAt: new Date("2026-05-06T09:00:00.000Z"),
      teacher: {
        id: "teacher-1",
        fullName: "Jane Doe",
      },
    });
    prismaMock.appUser.update.mockResolvedValueOnce({
      id: "student-1",
    });

    const { linkStudentClass } = await loadPortalRepository();
    await linkStudentClass("student-1", "class-1");

    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: {
        enrolledClasses: {
          connect: { id: "class-1" },
        },
      },
    });

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      enrolledClasses: [
        {
          id: "class-1",
        },
      ],
    });
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-1",
      title: "Mathematics 8A",
      startAt: new Date("2026-05-06T09:00:00.000Z"),
      teacher: {
        id: "teacher-1",
        fullName: "Jane Doe",
      },
    });

    await expect(linkStudentClass("student-1", "class-1")).rejects.toThrow(
      /already enrolled|duplicate/i,
    );
  });

  it("linkStudentClass rejects missing class targets before enrolling", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      enrolledClasses: [],
    });
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(null);

    const { linkStudentClass } = await loadPortalRepository();

    await expect(linkStudentClass("student-1", "missing-class")).rejects.toThrow(
      /class not found|not allowed|invalid/i,
    );
    expect(prismaMock.appUser.update).not.toHaveBeenCalled();
  });

  it("unlinkStudentClass disconnects an enrolled class from the student", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
      enrolledClasses: [
        {
          id: "class-1",
        },
      ],
    });
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-1",
      title: "Mathematics 8A",
      startAt: new Date("2026-05-06T09:00:00.000Z"),
      teacher: {
        id: "teacher-1",
        fullName: "Jane Doe",
      },
    });
    prismaMock.appUser.update.mockResolvedValueOnce({
      id: "student-1",
    });

    const { unlinkStudentClass } = await loadPortalRepository();
    const result = await unlinkStudentClass("student-1", "class-1");

    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: {
        enrolledClasses: {
          disconnect: { id: "class-1" },
        },
      },
    });
    expect(result).toEqual({
      studentId: "student-1",
      classId: "class-1",
    });
  });

  it("getStudentProgress returns recent progress records with subject metadata ordered by date", async () => {
    prismaMock.studentProgress.findMany.mockResolvedValueOnce([
      {
        id: "progress-1",
        gradeLevel: "Year 10",
        teacherNotes: "Strong algebra progress.",
        recordedAt: new Date("2026-05-08T09:00:00.000Z"),
        subject: { name: "Mathematics" },
      },
      {
        id: "progress-2",
        gradeLevel: "Year 9",
        teacherNotes: "Needs more practice.",
        recordedAt: new Date("2026-05-07T09:00:00.000Z"),
        subject: { name: "Physics" },
      },
    ]);

    const { getStudentProgress } = await loadPortalRepository();
    const result = await getStudentProgress("student-1");

    expect(prismaMock.studentProgress.findMany).toHaveBeenCalledWith({
      where: { studentId: "student-1" },
      select: {
        id: true,
        gradeLevel: true,
        teacherNotes: true,
        recordedAt: true,
        subject: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { recordedAt: "desc" },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "progress-1",
        gradeLevel: "Year 10",
        teacherNotes: "Strong algebra progress.",
        subject: expect.objectContaining({
          name: "Mathematics",
        }),
      }),
      expect.objectContaining({
        id: "progress-2",
        gradeLevel: "Year 9",
        teacherNotes: "Needs more practice.",
        subject: expect.objectContaining({
          name: "Physics",
        }),
      }),
    ]);
  });
});

describe("portal-repository admin parent management", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hashPasswordMock.mockResolvedValue("hashed-default-password");
  });

  it("getAdminParents builds parent registry filters without contradicting returned rows", async () => {
    prismaMock.appUser.count.mockResolvedValueOnce(1);
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      {
        id: "parent-1",
        fullName: "Mary Parent",
        email: "mary.parent@example.com",
        phoneWhatsapp: "+254700000001",
        isActive: true,
        children: [
          {
            id: "student-1",
            fullName: "Alice Student",
            email: "alice.student@example.com",
            isActive: true,
          },
        ],
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
      },
    ]);

    const { getAdminParents } = await loadPortalRepository();
    const result = await getAdminParents({
      page: 2,
      limit: 10,
      searchQuery: "parent",
      isActive: true,
      studentLinked: true,
      sort: "createdAtAsc",
    });

    expect(prismaMock.appUser.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        role: "PARENT",
        isActive: true,
        children: { some: {} },
      }),
    });
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "PARENT",
          isActive: true,
          children: { some: {} },
        }),
        include: expect.objectContaining({
          children: expect.any(Object),
        }),
        orderBy: [{ createdAt: "asc" }, { fullName: "asc" }],
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: "parent-1",
          fullName: "Mary Parent",
          email: "mary.parent@example.com",
          phoneWhatsapp: "+254700000001",
          isActive: true,
          children: expect.arrayContaining([
            expect.objectContaining({
              fullName: "Alice Student",
            }),
          ]),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      ],
      totalCount: 1,
      totalPages: 1,
    });
  });

  it("getAdminParents maps linked children, inactive linked students, timestamps, and empty children on a neutral query", async () => {
    prismaMock.appUser.count.mockResolvedValueOnce(2);
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      {
        id: "parent-1",
        fullName: "Mary Parent",
        email: "mary.parent@example.com",
        phoneWhatsapp: "+254700000001",
        isActive: true,
        children: [
          {
            id: "student-1",
            fullName: "Alice Student",
            email: "alice.student@example.com",
            isActive: true,
          },
          {
            id: "student-inactive",
            fullName: "Inactive Student",
            email: "inactive.student@example.com",
            isActive: false,
          },
        ],
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
      },
      {
        id: "parent-2",
        fullName: "Empty Parent",
        email: "empty.parent@example.com",
        phoneWhatsapp: null,
        isActive: false,
        children: [],
        createdAt: new Date("2026-05-02T10:00:00.000Z"),
        updatedAt: new Date("2026-05-05T10:00:00.000Z"),
      },
    ]);

    const { getAdminParents } = await loadPortalRepository();
    const result = await getAdminParents({ page: 1, limit: 20 });

    expect(prismaMock.appUser.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        role: "PARENT",
      }),
    });
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "PARENT",
        }),
        include: expect.objectContaining({
          children: expect.any(Object),
        }),
        orderBy: [{ fullName: "asc" }, { email: "asc" }],
        skip: 0,
        take: 20,
      }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: "parent-1",
          fullName: "Mary Parent",
          email: "mary.parent@example.com",
          phoneWhatsapp: "+254700000001",
          isActive: true,
          children: expect.arrayContaining([
            expect.objectContaining({
              fullName: "Alice Student",
              isActive: true,
            }),
            expect.objectContaining({
              fullName: "Inactive Student",
              isActive: false,
            }),
          ]),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
        expect.objectContaining({
          id: "parent-2",
          fullName: "Empty Parent",
          isActive: false,
          children: [],
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      ],
      totalCount: 2,
      totalPages: 1,
    });
  });

  it("createUser can be used for portal-capable PARENT account creation", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    prismaMock.appUser.create.mockResolvedValueOnce({
      id: "parent-1",
      fullName: "Mary Parent",
      email: "mary.parent@example.com",
      phoneWhatsapp: "+254700000001",
      role: "PARENT",
      isActive: true,
    });

    const { createUser } = await loadPortalRepository();
    const result = await createUser({
      fullName: "Mary Parent",
      email: "mary.parent@example.com",
      phoneWhatsapp: "+254700000001",
      role: "PARENT",
    });

    expect(prismaMock.appUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: "Mary Parent",
          email: "mary.parent@example.com",
          phoneWhatsapp: "+254700000001",
          role: "PARENT",
          passwordHash: "hashed-default-password",
          isActive: true,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        temporaryPassword: expect.stringMatching(/^[A-Za-z0-9_-]{20}$/),
        mustChangePassword: true,
        user: expect.objectContaining({
          role: "PARENT",
        }),
      }),
    );
  });

  it("getAdminParentById fetches a parent with linked students and rejects non-parent rows by contract", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      fullName: "Mary Parent",
      email: "mary.parent@example.com",
      phoneWhatsapp: "+254700000001",
      role: "PARENT",
      isActive: true,
      children: [
        {
          id: "student-1",
          fullName: "Alice Student",
          email: "alice.student@example.com",
          isActive: true,
        },
      ],
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { getAdminParentById } = await loadPortalRepository();
    const result = await getAdminParentById("parent-1");

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "parent-1" },
      include: {
        children: {
          select: {
            id: true,
            fullName: true,
            email: true,
            isActive: true,
          },
          orderBy: { fullName: "asc" },
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "parent-1",
        role: "PARENT",
        children: [
          expect.objectContaining({
            id: "student-1",
            fullName: "Alice Student",
          }),
        ],
      }),
    );
  });

  it("linkParentStudent connects a child through AppUser.children and prevents duplicates or wrong roles", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      children: [],
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
    });
    prismaMock.appUser.update.mockResolvedValueOnce({ id: "parent-1" });

    const { linkParentStudent } = await loadPortalRepository();
    await linkParentStudent("parent-1", "student-1");

    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "parent-1" },
      data: {
        children: {
          connect: { id: "student-1" },
        },
      },
    });

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      children: [{ id: "student-1" }],
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: "STUDENT",
    });

    await expect(linkParentStudent("parent-1", "student-1")).rejects.toThrow(
      /already linked|duplicate/i,
    );

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      children: [],
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: "TEACHER",
    });

    await expect(linkParentStudent("parent-1", "teacher-1")).rejects.toThrow(
      /student|not allowed|role/i,
    );
  });

  it("linkParentStudent rejects missing parent or missing student targets before relation writes", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);

    const { linkParentStudent } = await loadPortalRepository();
    await expect(linkParentStudent("missing-parent", "student-1")).rejects.toThrow(
      /parent|not found|not allowed/i,
    );

    expect(prismaMock.appUser.update).not.toHaveBeenCalled();

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      children: [],
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);

    await expect(linkParentStudent("parent-1", "missing-student")).rejects.toThrow(
      /student|not found|not allowed/i,
    );

    expect(prismaMock.appUser.update).not.toHaveBeenCalled();
  });

  it("unlinkParentStudent disconnects an existing child relation and rejects missing links", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      children: [{ id: "student-1" }],
    });
    prismaMock.appUser.update.mockResolvedValueOnce({ id: "parent-1" });

    const { unlinkParentStudent } = await loadPortalRepository();
    await unlinkParentStudent("parent-1", "student-1");

    expect(prismaMock.appUser.update).toHaveBeenCalledWith({
      where: { id: "parent-1" },
      data: {
        children: {
          disconnect: { id: "student-1" },
        },
      },
    });

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      role: "PARENT",
      children: [],
    });

    await expect(unlinkParentStudent("parent-1", "student-1")).rejects.toThrow(
      /not linked|link not found/i,
    );
  });
});

describe("portal-repository teacher portal visibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("getTeacherDashboardData scopes classes, lessons, assignments, and pending submissions to teacherId", async () => {
    const startAt = new Date("2026-06-01T09:00:00.000Z");
    const endAt = new Date("2026-06-01T10:00:00.000Z");
    const dueDate = new Date("2026-06-03T09:00:00.000Z");
    const submittedAt = new Date("2026-05-31T12:00:00.000Z");
    const submissionStorageKey = "private/teachers/teacher-john/submissions/submission-sofia.pdf";
    const externalHref =
      "https://CDN.Example.com/Files/Submission%20One.pdf?download=1#teacher-copy";
    const crossPurposeHref = `/api/public-files/${encodeStorageKey(submissionStorageKey)}`;
    const submissionRecord = (
      id: string,
      contentUrl: string,
      attachments: Array<{ storageKey: string }> = [],
    ) => ({
      id,
      contentUrl,
      submittedAt,
      attachments,
      student: {
        id: `student-${id}`,
        fullName: `Student ${id}`,
        email: `${id}@example.com`,
      },
      assignment: {
        id: "assignment-math",
        title: "Math Homework",
        scheduledClass: { id: "class-math", title: "Math - Group A", classGroup: null },
      },
    });

    prismaMock.classGroup.count.mockResolvedValueOnce(1);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(1);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(1);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(1);
    prismaMock.assignment.count.mockResolvedValueOnce(1);
    prismaMock.submission.count.mockResolvedValueOnce(1);
    prismaMock.submission.count.mockResolvedValueOnce(0);
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      { id: "student-sofia" },
      { id: "student-mark" },
    ]);
    prismaMock.classGroup.findMany.mockResolvedValueOnce([]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "class-math",
        title: "Math - Group A",
        description: "Assigned to John Smith",
        startAt,
        endAt,
        liveLessonUrl: "https://example.com/live/math",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        students: [
          { id: "student-sofia", fullName: "Sofia", email: "sofia@example.com" },
          { id: "student-mark", fullName: "Mark", email: "mark@example.com" },
        ],
      },
    ]);
    prismaMock.assignment.findMany.mockResolvedValueOnce([
      {
        id: "assignment-math",
        title: "Math Homework",
        description: "Algebra practice",
        dueDate,
        scheduledClassId: "class-math",
        scheduledClass: { id: "class-math", title: "Math - Group A", classGroup: null },
        submissions: [{ id: "submission-sofia", grade: null }],
      },
    ]);
    prismaMock.submission.findMany.mockResolvedValueOnce([
      {
        ...submissionRecord("submission-sofia", "https://cdn.example.com/stale-submission.pdf", [
          { storageKey: submissionStorageKey },
        ]),
        student: {
          id: "student-sofia",
          fullName: "Sofia",
          email: "sofia@example.com",
        },
      },
      submissionRecord("submission-external", externalHref),
      submissionRecord(
        "submission-malformed",
        "private/teachers/teacher-john/submissions/file name.pdf",
      ),
      submissionRecord("submission-cross-purpose", crossPurposeHref),
    ]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "class-math",
        title: "Math - Group A",
        description: "Assigned to John Smith",
        startAt,
        endAt,
        liveLessonUrl: "https://example.com/live/math",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        students: [{ id: "student-sofia" }, { id: "student-mark" }],
      },
    ]);

    const { getTeacherDashboardData } = await loadPortalRepository();
    const result = await getTeacherDashboardData("teacher-john");

    expect(prismaMock.classGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teacherId: "teacher-john",
        },
      }),
    );
    expect(prismaMock.scheduledClass.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          teacherId: "teacher-john",
          classGroupId: null,
        },
        select: expect.objectContaining({
          subject: { select: { id: true, name: true, slug: true } },
          students: { select: { id: true, fullName: true, email: true, isActive: true } },
          classGroup: {
            select: {
              id: true,
              name: true,
              students: { select: { id: true, fullName: true, email: true } },
            },
          },
        }),
      }),
    );
    expect(prismaMock.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { scheduledClass: { teacherId: "teacher-john" } },
            { scheduledClass: { classGroup: { teacherId: "teacher-john" } } },
          ]),
          archivedAt: null,
          dueDate: expect.any(Object),
        }),
      }),
    );
    expect(prismaMock.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          grade: null,
          assignment: expect.objectContaining({
            OR: expect.arrayContaining([
              { scheduledClass: { teacherId: "teacher-john" } },
              { scheduledClass: { classGroup: { teacherId: "teacher-john" } } },
            ]),
          }),
        }),
      }),
    );
    expect(prismaMock.submission.findMany.mock.calls[0]?.[0]?.select?.attachments).toEqual({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { storageKey: true },
      take: 1,
    });
    expect(result.classes).toEqual([
      expect.objectContaining({
        id: "class-math",
        title: "Math - Group A",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        studentCount: 2,
        students: expect.arrayContaining([
          expect.objectContaining({ id: "student-sofia" }),
          expect.objectContaining({ id: "student-mark" }),
        ]),
      }),
    ]);
    expect(result.upcomingLessons).toEqual([
      expect.objectContaining({
        id: "class-math",
        title: "Math - Group A",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        studentCount: 2,
      }),
    ]);
    expect(result.pendingSubmissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentUrl: storageUrlForKey(submissionStorageKey),
          studentName: "Sofia",
          assignmentTitle: "Math Homework",
          classTitle: "Math - Group A",
        }),
        expect.objectContaining({ id: "submission-external", contentUrl: externalHref }),
        expect.objectContaining({ id: "submission-malformed", contentUrl: null }),
        expect.objectContaining({ id: "submission-cross-purpose", contentUrl: null }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("Other Teacher");
    expect(JSON.stringify(result)).not.toContain("Unassigned Student");
  });

  it("getTeacherDashboardData includes assigned ClassGroups, their lessons, and group-enrolled students", async () => {
    const startAt = new Date("2026-06-01T09:00:00.000Z");
    const endAt = new Date("2026-06-01T10:00:00.000Z");

    prismaMock.classGroup.count.mockResolvedValueOnce(1);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(1);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(1);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(1);
    prismaMock.assignment.count.mockResolvedValueOnce(0);
    prismaMock.submission.count.mockResolvedValueOnce(0);
    prismaMock.submission.count.mockResolvedValueOnce(0);
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      { id: "student-sofia" },
      { id: "student-mark" },
    ]);
    prismaMock.classGroup.findMany.mockResolvedValueOnce([
      {
        id: "group-math-a",
        name: "IGCSE Mathematics Group A",
        status: "ACTIVE",
        capacity: 12,
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        level: { id: "level-igcse", name: "IGCSE" },
        students: [
          {
            id: "student-sofia",
            fullName: "Sofia Shevchenko",
            email: "sofia@example.com",
            isActive: true,
          },
          {
            id: "student-mark",
            fullName: "Mark Shevchenko",
            email: "mark@example.com",
            isActive: true,
          },
        ],
        lessons: [
          {
            id: "lesson-group-math",
            title: "Quadratic functions",
            description: "Group-owned lesson",
            startAt,
            endAt,
            status: "SCHEDULED",
            assignments: [],
          },
        ],
      },
    ]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "lesson-group-math",
        title: "Quadratic functions",
        description: "Group-owned lesson",
        startAt,
        endAt,
        liveLessonUrl: "https://example.com/live/group-math",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        students: [],
        classGroup: {
          id: "group-math-a",
          name: "IGCSE Mathematics Group A",
          teacherId: "teacher-john",
          students: [
            { id: "student-sofia", fullName: "Sofia Shevchenko", email: "sofia@example.com" },
            { id: "student-mark", fullName: "Mark Shevchenko", email: "mark@example.com" },
          ],
        },
      },
    ]);
    prismaMock.assignment.findMany.mockResolvedValueOnce([]);
    prismaMock.submission.findMany.mockResolvedValueOnce([]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "lesson-group-math",
        title: "Quadratic functions",
        description: "Group-owned lesson",
        startAt,
        endAt,
        liveLessonUrl: "https://example.com/live/group-math",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        students: [],
        classGroup: {
          id: "group-math-a",
          name: "IGCSE Mathematics Group A",
          teacherId: "teacher-john",
          students: [
            { id: "student-sofia", fullName: "Sofia Shevchenko", email: "sofia@example.com" },
            { id: "student-mark", fullName: "Mark Shevchenko", email: "mark@example.com" },
          ],
        },
      },
    ]);

    const { getTeacherDashboardData } = await loadPortalRepository();
    const result = await getTeacherDashboardData("teacher-john");

    expect(prismaMock.classGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teacherId: "teacher-john",
        },
        select: expect.objectContaining({
          students: { select: { id: true, fullName: true, email: true, isActive: true } },
          lessons: expect.any(Object),
        }),
      }),
    );
    expect(JSON.stringify(result)).toContain("IGCSE Mathematics Group A");
    expect(JSON.stringify(result)).toContain("Sofia Shevchenko");
    expect(JSON.stringify(result)).toContain("Mark Shevchenko");
    expect(JSON.stringify(result)).not.toContain("Unrelated Group Lesson");
  });

  it("getTeacherDashboardData returns safe empty dashboard data for a teacher with no assigned classes", async () => {
    prismaMock.classGroup.count.mockResolvedValueOnce(0);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(0);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(0);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(0);
    prismaMock.assignment.count.mockResolvedValueOnce(0);
    prismaMock.submission.count.mockResolvedValueOnce(0);
    prismaMock.submission.count.mockResolvedValueOnce(0);
    prismaMock.appUser.findMany.mockResolvedValueOnce([]);
    prismaMock.classGroup.findMany.mockResolvedValueOnce([]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);
    prismaMock.assignment.findMany.mockResolvedValueOnce([]);
    prismaMock.submission.findMany.mockResolvedValueOnce([]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);

    const { getTeacherDashboardData } = await loadPortalRepository();
    const result = await getTeacherDashboardData("teacher-empty");

    expect(result).toEqual({
      metrics: {
        activeGroups: 0,
        scheduledLessons: 0,
        todayLessons: 0,
        upcomingLessons: 0,
        activeStudents: 0,
        activeAssignments: 0,
        pendingSubmissions: 0,
        gradedThisWeek: 0,
        attendanceToMark: 0,
        reportsToGenerate: 0,
      },
      todayLessons: [],
      upcomingLessons: [],
      pastLessons: [],
      classes: [],
      activeAssignments: [],
      pendingSubmissions: [],
      alerts: [],
    });
  });

  it("listTeacherHomework returns only assignments for classes owned by the teacher", async () => {
    prismaMock.assignment.findMany.mockResolvedValueOnce([]);

    const { listTeacherHomework } = await loadPortalRepository();
    await listTeacherHomework("teacher-john");

    expect(prismaMock.assignment.findMany).toHaveBeenCalledWith({
      where: {
        scheduledClass: {
          teacherId: "teacher-john",
        },
      },
      include: {
        scheduledClass: { select: { title: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { dueDate: "desc" },
    });
  });

  it("submission listing and grading are scoped to the teacher-owned assignment context", async () => {
    prismaMock.submission.findMany.mockResolvedValueOnce([]);

    const { listSubmissionsForAssignmentByTeacher, gradeSubmissionForTeacher } =
      await loadPortalRepository();
    await listSubmissionsForAssignmentByTeacher({
      teacherId: "teacher-john",
      assignmentId: "assignment-math",
    });

    expect(prismaMock.submission.findMany).toHaveBeenCalledWith({
      where: {
        assignmentId: "assignment-math",
        assignment: {
          scheduledClass: {
            teacherId: "teacher-john",
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    prismaMock.submission.findFirst.mockResolvedValueOnce(null);

    await expect(
      gradeSubmissionForTeacher({
        teacherId: "teacher-john",
        submissionId: "submission-other-teacher",
        grade: 92,
        feedback: "Checked",
      }),
    ).rejects.toThrow(/not found|not owned|teacher/i);
    expect(prismaMock.submission.findFirst).toHaveBeenCalledWith({
      where: {
        id: "submission-other-teacher",
        assignment: {
          scheduledClass: {
            OR: [{ teacherId: "teacher-john" }, { classGroup: { teacherId: "teacher-john" } }],
          },
        },
      },
      select: { id: true },
    });
    expect(prismaMock.submission.update).not.toHaveBeenCalled();

    prismaMock.submission.findMany.mockResolvedValueOnce([]);

    await listSubmissionsForAssignmentByTeacher({
      teacherId: "teacher-a",
      assignmentId: "assignment-reassigned-to-teacher-b",
    });

    expect(prismaMock.submission.findMany).toHaveBeenLastCalledWith({
      where: {
        assignmentId: "assignment-reassigned-to-teacher-b",
        assignment: {
          scheduledClass: {
            teacherId: "teacher-a",
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    prismaMock.submission.findFirst.mockResolvedValueOnce(null);

    await expect(
      gradeSubmissionForTeacher({
        teacherId: "teacher-a",
        submissionId: "submission-from-reassigned-class",
        grade: 88,
        feedback: "Teacher A should no longer own this class",
      }),
    ).rejects.toThrow(/not found|not owned|teacher/i);
    expect(prismaMock.submission.findFirst).toHaveBeenLastCalledWith({
      where: {
        id: "submission-from-reassigned-class",
        assignment: {
          scheduledClass: {
            OR: [{ teacherId: "teacher-a" }, { classGroup: { teacherId: "teacher-a" } }],
          },
        },
      },
      select: { id: true },
    });
  });

  it("progress note listing requires the student to be enrolled in a class assigned to the teacher", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "class-math",
    });
    prismaMock.studentProgress.findMany.mockResolvedValueOnce([
      {
        id: "progress-1",
        studentId: "student-sofia",
        teacherId: "teacher-john",
        subjectId: "subject-math",
      },
    ]);

    const { listProgressNotesForTeacherStudentSubject } = await loadPortalRepository();
    const result = await listProgressNotesForTeacherStudentSubject({
      teacherId: "teacher-john",
      studentId: "student-sofia",
      subjectId: "subject-math",
    });

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith({
      where: {
        teacherId: "teacher-john",
        students: {
          some: { id: "student-sofia" },
        },
      },
      select: { id: true },
    });
    expect(prismaMock.studentProgress.findMany).toHaveBeenCalledWith({
      where: {
        teacherId: "teacher-john",
        studentId: "student-sofia",
        subjectId: "subject-math",
      },
      orderBy: { recordedAt: "desc" },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "progress-1",
        studentId: "student-sofia",
      }),
    ]);

    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(null);

    await expect(
      listProgressNotesForTeacherStudentSubject({
        teacherId: "teacher-john",
        studentId: "student-other-teacher",
        subjectId: "subject-math",
      }),
    ).rejects.toThrow(/unauthorized/i);
  });

  it("createProgressNote must not allow progress records for students outside the teacher assigned class context", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(null);

    const { createProgressNote } = await loadPortalRepository();

    await expect(
      createProgressNote({
        teacherId: "teacher-john",
        studentId: "student-other-teacher",
        subjectId: "subject-math",
        content: "Should not be allowed",
        performanceLevel: "GOOD",
      }),
    ).rejects.toThrow(/unauthorized|not assigned|class|student/i);
    expect(prismaMock.studentProgress.create).not.toHaveBeenCalled();
  });
});

describe("portal-repository parent portal visibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("getParentScopedStudentData requires the requested child to belong to the parent", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      children: [
        {
          id: "student-1",
          fullName: "Sofia Shevchenko",
          enrolledClasses: [],
          submissions: [],
          studentProgresses: [],
        },
      ],
    });

    const { getParentScopedStudentData } = await loadPortalRepository();
    const result = await getParentScopedStudentData({
      parentId: "parent-1",
      childId: "student-1",
    });

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "parent-1" },
      include: {
        children: expect.objectContaining({
          where: { id: "student-1" },
        }),
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        childId: "student-1",
        childName: "Sofia Shevchenko",
        enrolledClasses: [],
        submissions: [],
        progress: [],
      }),
    );

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      children: [],
    });

    await expect(
      getParentScopedStudentData({
        parentId: "parent-1",
        childId: "unlinked-student",
      }),
    ).rejects.toThrow(/unauthorized/i);
  });

  it("listParentScopedSubmissions scopes child submissions through the parent relation", async () => {
    prismaMock.submission.findMany.mockResolvedValueOnce([]);

    const { listParentScopedSubmissions } = await loadPortalRepository();
    const result = await listParentScopedSubmissions({
      parentId: "parent-1",
      childId: "student-1",
    });

    expect(prismaMock.submission.findMany).toHaveBeenCalledWith({
      where: {
        studentId: "student-1",
        student: {
          parents: {
            some: { id: "parent-1" },
          },
        },
      },
      include: {
        assignment: true,
      },
      orderBy: { submittedAt: "desc" },
    });
    expect(result).toEqual([]);
  });
});
