import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  assignment: {
    count: vi.fn(),
  },
  levelSubject: {
    count: vi.fn(),
  },
  scheduledClass: {
    count: vi.fn(),
  },
  studentProgress: {
    count: vi.fn(),
  },
  subject: {
    create: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  teacherSubject: {
    count: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type SubjectRepositoryModule = {
  listAdminSubjects: (filters?: {
    searchQuery?: string;
    isActive?: boolean;
  }) => Promise<AdminSubjectRecord[]>;
  getSubjectById: (id: string) => Promise<AdminSubjectRecord | null>;
  createSubject: (input: SubjectMutationInput) => Promise<AdminSubjectRecord>;
  updateSubject: (
    id: string,
    input: Partial<SubjectMutationInput>,
  ) => Promise<AdminSubjectRecord & SubjectAuditSnapshots>;
  setSubjectActive: (
    id: string,
    isActive: boolean,
  ) => Promise<AdminSubjectRecord & SubjectAuditSnapshots>;
  deleteSubject: (id: string) => Promise<{ id: string }>;
  listActiveSubjects: () => Promise<ActiveSubjectRecord[]>;
};

type AdminSubjectRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  priority: number;
  teachersCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type ActiveSubjectRecord = Omit<AdminSubjectRecord, "teachersCount">;

type SubjectAuditSnapshots = {
  before: Omit<AdminSubjectRecord, "teachersCount">;
  after: Omit<AdminSubjectRecord, "teachersCount">;
};

type SubjectMutationInput = {
  slug: string;
  name: string;
  description: string;
  isActive?: boolean;
  priority?: number;
};

async function loadSubjectRepository() {
  const specifier = "@/lib/repositories/subject-repository";
  return import(/* @vite-ignore */ specifier) as Promise<SubjectRepositoryModule>;
}

describe("subject-repository admin contract", () => {
  const createdAt = new Date("2026-05-01T09:00:00.000Z");
  const updatedAt = new Date("2026-05-10T09:00:00.000Z");

  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.assignment.count.mockResolvedValue(0);
    prismaMock.levelSubject.count.mockResolvedValue(0);
    prismaMock.scheduledClass.count.mockResolvedValue(0);
    prismaMock.studentProgress.count.mockResolvedValue(0);
    prismaMock.teacherSubject.count.mockResolvedValue(0);
  });

  it("lists admin subjects with search, active filter, teacher counts, timestamps, and stable ordering", async () => {
    prismaMock.subject.findMany.mockResolvedValueOnce([
      {
        id: "subject-biology",
        slug: "biology",
        name: "Biology",
        description: "Biology support",
        isActive: true,
        priority: 1,
        createdAt,
        updatedAt,
        _count: { teacherSubjects: 2 },
      },
    ]);

    const { listAdminSubjects } = await loadSubjectRepository();
    const result = await listAdminSubjects({ searchQuery: "bio", isActive: true });

    expect(prismaMock.subject.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { name: { contains: "bio", mode: "insensitive" } },
          { slug: { contains: "bio", mode: "insensitive" } },
        ],
      },
      include: {
        _count: {
          select: {
            teacherSubjects: true,
          },
        },
      },
      orderBy: [{ priority: "asc" }, { name: "asc" }],
    });
    expect(result).toEqual([
      {
        id: "subject-biology",
        slug: "biology",
        name: "Biology",
        description: "Biology support",
        isActive: true,
        priority: 1,
        teachersCount: 2,
        createdAt,
        updatedAt,
      },
    ]);
  });

  it("gets one subject by id with admin metadata and linked teachers count", async () => {
    prismaMock.subject.findUnique.mockResolvedValueOnce({
      id: "subject-chemistry",
      slug: "chemistry",
      name: "Chemistry",
      description: "Chemistry support",
      isActive: false,
      priority: 3,
      createdAt,
      updatedAt,
      _count: { teacherSubjects: 1 },
    });

    const { getSubjectById } = await loadSubjectRepository();
    const result = await getSubjectById("subject-chemistry");

    expect(prismaMock.subject.findUnique).toHaveBeenCalledWith({
      where: { id: "subject-chemistry" },
      include: {
        _count: {
          select: {
            teacherSubjects: true,
          },
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "subject-chemistry",
        teachersCount: 1,
        createdAt,
        updatedAt,
      }),
    );
  });

  it("creates a subject after validating the slug is unique", async () => {
    prismaMock.subject.findUnique.mockResolvedValueOnce(null);
    prismaMock.subject.create.mockResolvedValueOnce({
      id: "subject-economics",
      slug: "economics",
      name: "Economics",
      description: "Economics support",
      isActive: true,
      priority: 4,
      createdAt,
      updatedAt,
      _count: { teacherSubjects: 0 },
    });

    const { createSubject } = await loadSubjectRepository();
    const result = await createSubject({
      slug: "economics",
      name: "Economics",
      description: "Economics support",
      isActive: true,
      priority: 4,
    });

    expect(prismaMock.subject.findUnique).toHaveBeenCalledWith({
      where: { slug: "economics" },
      select: { id: true },
    });
    expect(prismaMock.subject.create).toHaveBeenCalledWith({
      data: {
        slug: "economics",
        name: "Economics",
        description: "Economics support",
        isActive: true,
        priority: 4,
      },
      include: {
        _count: {
          select: {
            teacherSubjects: true,
          },
        },
      },
    });
    expect(result).toEqual(expect.objectContaining({ id: "subject-economics", teachersCount: 0 }));
  });

  it("rejects creating a subject with an existing slug", async () => {
    prismaMock.subject.findUnique.mockResolvedValueOnce({ id: "subject-existing" });

    const { createSubject } = await loadSubjectRepository();

    await expect(
      createSubject({
        slug: "mathematics",
        name: "Mathematics",
        description: "Math support",
      }),
    ).rejects.toThrow(/slug.*already exists|already exists.*slug/i);
    expect(prismaMock.subject.create).not.toHaveBeenCalled();
  });

  it("updates subject catalogue and scheduling metadata", async () => {
    prismaMock.subject.findUnique.mockResolvedValueOnce({
      id: "subject-physics",
      slug: "physics",
      name: "Physics",
      description: "Physics support",
      isActive: true,
      priority: 5,
      createdAt,
      updatedAt,
      _count: { teacherSubjects: 3 },
    });
    prismaMock.subject.update.mockResolvedValueOnce({
      id: "subject-physics",
      slug: "physics",
      name: "Physics",
      description: "Updated physics support",
      isActive: true,
      priority: 2,
      createdAt,
      updatedAt,
      _count: { teacherSubjects: 3 },
    });

    const { updateSubject } = await loadSubjectRepository();
    const result = await updateSubject("subject-physics", {
      name: "Physics",
      description: "Updated physics support",
      priority: 2,
    });

    expect(prismaMock.subject.findUnique).toHaveBeenCalledWith({
      where: { id: "subject-physics" },
      include: {
        _count: {
          select: {
            teacherSubjects: true,
          },
        },
      },
    });
    expect(prismaMock.subject.update).toHaveBeenCalledWith({
      where: { id: "subject-physics" },
      data: {
        name: "Physics",
        description: "Updated physics support",
        priority: 2,
      },
      include: {
        _count: {
          select: {
            teacherSubjects: true,
          },
        },
      },
    });
    expect(result).toEqual(expect.objectContaining({ id: "subject-physics", teachersCount: 3 }));
    expect(result.before).toEqual(
      expect.objectContaining({
        id: "subject-physics",
        slug: "physics",
        name: "Physics",
        description: "Physics support",
        isActive: true,
        priority: 5,
      }),
    );
    expect(result.before).not.toEqual({ id: "subject-physics" });
    expect(result.after).toEqual(
      expect.objectContaining({
        id: "subject-physics",
        slug: "physics",
        name: "Physics",
        description: "Updated physics support",
        isActive: true,
        priority: 2,
      }),
    );
  });

  it("sets a subject active state without requiring a broader update payload", async () => {
    prismaMock.subject.findUnique.mockResolvedValueOnce({
      id: "subject-history",
      slug: "history",
      name: "History",
      description: "History support",
      isActive: true,
      priority: 8,
      createdAt,
      updatedAt,
      _count: { teacherSubjects: 0 },
    });
    prismaMock.subject.update.mockResolvedValueOnce({
      id: "subject-history",
      slug: "history",
      name: "History",
      description: "History support",
      isActive: false,
      priority: 8,
      createdAt,
      updatedAt,
      _count: { teacherSubjects: 0 },
    });

    const { setSubjectActive } = await loadSubjectRepository();
    const result = await setSubjectActive("subject-history", false);

    expect(prismaMock.subject.findUnique).toHaveBeenCalledWith({
      where: { id: "subject-history" },
      include: {
        _count: {
          select: {
            teacherSubjects: true,
          },
        },
      },
    });
    expect(prismaMock.subject.update).toHaveBeenCalledWith({
      where: { id: "subject-history" },
      data: { isActive: false },
      include: {
        _count: {
          select: {
            teacherSubjects: true,
          },
        },
      },
    });
    expect(result).toEqual(expect.objectContaining({ id: "subject-history", isActive: false }));
    expect(result.before).toEqual(
      expect.objectContaining({
        id: "subject-history",
        slug: "history",
        name: "History",
        description: "History support",
        isActive: true,
        priority: 8,
      }),
    );
    expect(result.before).not.toEqual({ id: "subject-history" });
    expect(result.after).toEqual(
      expect.objectContaining({
        id: "subject-history",
        slug: "history",
        name: "History",
        description: "History support",
        isActive: false,
        priority: 8,
      }),
    );
  });

  it("deletes a subject only when no existing academic dependencies reference it", async () => {
    prismaMock.subject.findUnique.mockResolvedValueOnce({
      id: "subject-unused",
      _count: {
        teacherSubjects: 0,
        levelSubjects: 0,
        studentProgress: 0,
      },
    });
    prismaMock.subject.delete.mockResolvedValueOnce({ id: "subject-unused" });

    const { deleteSubject } = await loadSubjectRepository();
    const result = await deleteSubject("subject-unused");

    expect(prismaMock.subject.findUnique).toHaveBeenCalledWith({
      where: { id: "subject-unused" },
      include: {
        _count: {
          select: {
            teacherSubjects: true,
            levelSubjects: true,
            studentProgress: true,
          },
        },
      },
    });
    expect(prismaMock.assignment.count).toHaveBeenCalledWith({
      where: { subjectId: "subject-unused" },
    });
    expect(prismaMock.subject.delete).toHaveBeenCalledWith({
      where: { id: "subject-unused" },
    });
    expect(result).toEqual({ id: "subject-unused" });
  });

  it.each([
    {
      dependency: "TeacherSubject",
      counts: { teacherSubjects: 1, levelSubjects: 0, studentProgress: 0 },
      assignmentCount: 0,
    },
    {
      dependency: "LevelSubject",
      counts: { teacherSubjects: 0, levelSubjects: 1, studentProgress: 0 },
      assignmentCount: 0,
    },
    {
      dependency: "StudentProgress",
      counts: { teacherSubjects: 0, levelSubjects: 0, studentProgress: 1 },
      assignmentCount: 0,
    },
    {
      dependency: "Assignment.subjectId",
      counts: { teacherSubjects: 0, levelSubjects: 0, studentProgress: 0 },
      assignmentCount: 1,
    },
  ])("rejects deleting a subject linked to $dependency", async ({ counts, assignmentCount }) => {
    prismaMock.subject.findUnique.mockResolvedValueOnce({
      id: "subject-in-use",
      _count: counts,
    });
    prismaMock.teacherSubject.count.mockResolvedValue(counts.teacherSubjects);
    prismaMock.levelSubject.count.mockResolvedValue(counts.levelSubjects);
    prismaMock.studentProgress.count.mockResolvedValue(counts.studentProgress);
    prismaMock.assignment.count.mockResolvedValue(assignmentCount);

    const { deleteSubject } = await loadSubjectRepository();

    await expect(deleteSubject("subject-in-use")).rejects.toThrow(
      /dependencies|in use|cannot be deleted/i,
    );
    expect(prismaMock.subject.delete).not.toHaveBeenCalled();
  });

  it("lists active subjects only, sorted by priority then name", async () => {
    prismaMock.subject.findMany.mockResolvedValueOnce([
      {
        id: "subject-biology",
        slug: "biology",
        name: "Biology",
        description: "Biology support",
        isActive: true,
        priority: 1,
        createdAt,
        updatedAt,
      },
      {
        id: "subject-chemistry",
        slug: "chemistry",
        name: "Chemistry",
        description: "Chemistry support",
        isActive: true,
        priority: 1,
        createdAt,
        updatedAt,
      },
    ]);

    const { listActiveSubjects } = await loadSubjectRepository();
    const result = await listActiveSubjects();

    expect(prismaMock.subject.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ priority: "asc" }, { name: "asc" }],
    });
    expect(result.map((subject) => subject.name)).toEqual(["Biology", "Chemistry"]);
  });
});
