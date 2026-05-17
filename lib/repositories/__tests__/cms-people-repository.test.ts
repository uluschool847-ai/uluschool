import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  teacher: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  testimonial: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type CmsRepositoryModule = {
  getActiveTeachers: () => Promise<
    Array<{
      id: string;
      fullName: string;
      title: string;
      bio: string;
      photoUrl?: string | null;
      subjects: Array<{ id: string; slug: string; name: string }>;
      cabinetUserId?: string | null;
      displayOrder: number;
      isActive: boolean;
      updatedAt: Date;
    }>
  >;
  getAdminTeachers: () => Promise<
    Array<{
      id: string;
      fullName: string;
      title: string;
      bio: string;
      photoUrl?: string | null;
      subjects: Array<{ id: string; slug: string; name: string }>;
      cabinetUserId?: string | null;
      displayOrder: number;
      isActive: boolean;
      updatedAt: Date;
    }>
  >;
  getTeacherById: (id: string) => Promise<{
    id: string;
    fullName: string;
    title: string;
    bio: string;
    photoUrl?: string | null;
    subjects: Array<{ id: string; slug: string; name: string }>;
    cabinetUserId?: string | null;
    displayOrder: number;
    isActive: boolean;
    updatedAt: Date;
  } | null>;
  createTeacher: (
    input: {
      fullName: string;
      title: string;
      bio: string;
      photoUrl?: string | null;
      subjects: string[];
      cabinetUserId?: string | null;
      displayOrder: number;
      isActive: boolean;
    },
    database?: unknown,
  ) => Promise<unknown>;
  updateTeacher: (
    id: string,
    input: {
      fullName?: string;
      title?: string;
      bio?: string;
      photoUrl?: string | null;
      subjects?: string[];
      cabinetUserId?: string | null;
      displayOrder?: number;
      isActive?: boolean;
    },
    database?: unknown,
  ) => Promise<unknown>;
  setTeacherActive: (id: string, isActive: boolean, database?: unknown) => Promise<unknown>;
  deleteTeacher: (id: string) => Promise<unknown>;
  getPublishedTestimonials: () => Promise<
    Array<{
      id: string;
      studentName: string;
      guardianName?: string | null;
      quote: string;
      levelLabel: string;
      photoUrl?: string | null;
      isPublished?: boolean;
      displayOrder: number;
      createdAt: Date;
    }>
  >;
};

async function loadCmsRepository() {
  const specifier = "@/lib/repositories/cms-repository";
  return import(/* @vite-ignore */ specifier) as Promise<CmsRepositoryModule>;
}

describe("cms-repository teachers and testimonials queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getActiveTeachers returns only active teachers ordered for public display", async () => {
    const mathematics = { id: "subject-1", slug: "mathematics", name: "Mathematics" };
    const physics = { id: "subject-2", slug: "physics", name: "Physics" };

    prismaMock.teacher.findMany.mockResolvedValueOnce([
      {
        id: "teacher-1",
        fullName: "Alice Teacher",
        title: "STEM Specialist",
        bio: "Cambridge specialist",
        photoUrl: "/alice.jpg",
        subjects: [mathematics, physics],
        cabinetUserId: "teacher-123",
        displayOrder: 1,
        isActive: true,
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
        teacherSubjects: [{ subject: mathematics }, { subject: physics }],
      },
      {
        id: "teacher-2",
        fullName: "Brian Teacher",
        title: "Science Specialist",
        bio: "Exam prep specialist",
        photoUrl: "/brian.jpg",
        subjects: [{ id: "subject-3", slug: "biology", name: "Biology" }],
        cabinetUserId: null,
        displayOrder: 2,
        isActive: true,
        updatedAt: new Date("2026-05-02T10:00:00.000Z"),
        teacherSubjects: [{ subject: { id: "subject-3", slug: "biology", name: "Biology" } }],
      },
    ]);

    const { getActiveTeachers } = await loadCmsRepository();
    const result = await getActiveTeachers();

    expect(prismaMock.teacher.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }],
      include: {
        teacherSubjects: {
          include: {
            subject: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
        },
      },
    });
    expect(result.map((teacher) => teacher.fullName)).toEqual(["Alice Teacher", "Brian Teacher"]);
    expect(result[0]).toEqual(
      expect.objectContaining({
        photoUrl: "/alice.jpg",
        cabinetUserId: "teacher-123",
        updatedAt: expect.any(Date),
        subjects: expect.arrayContaining([expect.objectContaining({ name: "Mathematics" })]),
      }),
    );
  });

  it("getAdminTeachers returns all teachers in admin display order", async () => {
    const mathematics = { id: "subject-1", slug: "mathematics", name: "Mathematics" };

    prismaMock.teacher.findMany.mockResolvedValueOnce([
      {
        id: "teacher-2",
        fullName: "Brian Teacher",
        title: "Physics Specialist",
        bio: "Exam prep specialist",
        photoUrl: "/brian.jpg",
        subjects: [{ id: "subject-3", slug: "biology", name: "Biology" }],
        cabinetUserId: null,
        displayOrder: 2,
        isActive: false,
        updatedAt: new Date("2026-05-02T10:00:00.000Z"),
        teacherSubjects: [{ subject: { id: "subject-3", slug: "biology", name: "Biology" } }],
      },
      {
        id: "teacher-1",
        fullName: "Alice Teacher",
        title: "Mathematics Specialist",
        bio: "Cambridge specialist",
        photoUrl: "/alice.jpg",
        subjects: [mathematics],
        cabinetUserId: "teacher-123",
        displayOrder: 1,
        isActive: true,
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
        teacherSubjects: [{ subject: mathematics }],
      },
    ]);

    const { getAdminTeachers } = await loadCmsRepository();
    const result = await getAdminTeachers();

    expect(prismaMock.teacher.findMany).toHaveBeenCalledWith({
      orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }],
      include: {
        teacherSubjects: {
          include: {
            subject: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
        },
      },
    });
    expect(result.map((teacher) => teacher.id)).toEqual(["teacher-1", "teacher-2"]);
    expect(result[0]).toEqual(
      expect.objectContaining({
        photoUrl: "/alice.jpg",
        updatedAt: expect.any(Date),
        subjects: expect.arrayContaining([expect.objectContaining({ name: "Mathematics" })]),
      }),
    );
  });

  it("getTeacherById returns a teacher profile for editing", async () => {
    const mathematics = { id: "subject-1", slug: "mathematics", name: "Mathematics" };

    prismaMock.teacher.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      fullName: "Alice Teacher",
      title: "Mathematics Specialist",
      bio: "Cambridge specialist",
      photoUrl: "/alice.jpg",
      subjects: [mathematics],
      cabinetUserId: "teacher-123",
      displayOrder: 1,
      isActive: true,
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
      teacherSubjects: [{ subject: mathematics }],
    });

    const { getTeacherById } = await loadCmsRepository();
    const result = await getTeacherById("teacher-1");

    expect(prismaMock.teacher.findUnique).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      include: {
        teacherSubjects: {
          include: {
            subject: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "teacher-1",
        fullName: "Alice Teacher",
        cabinetUserId: "teacher-123",
        subjects: expect.arrayContaining([expect.objectContaining({ name: "Mathematics" })]),
      }),
    );
  });

  it("createTeacher persists the required and optional teacher fields", async () => {
    prismaMock.teacher.create.mockResolvedValueOnce({ id: "teacher-1" });

    const { createTeacher } = await loadCmsRepository();
    await createTeacher({
      fullName: "Jane Doe",
      title: "Mathematics Teacher",
      bio: "Cambridge mathematics specialist with a complete public profile.",
      photoUrl: "/uploads/jane.webp",
      subjects: ["subject-1", "subject-2"],
      cabinetUserId: "teacher-123",
      displayOrder: 1,
      isActive: true,
    });

    expect(prismaMock.teacher.create).toHaveBeenCalledWith({
      data: {
        fullName: "Jane Doe",
        title: "Mathematics Teacher",
        bio: "Cambridge mathematics specialist with a complete public profile.",
        photoUrl: "/uploads/jane.webp",
        subjects: ["subject-1", "subject-2"],
        cabinetUserId: "teacher-123",
        displayOrder: 1,
        isActive: true,
      },
    });
  });

  it("createTeacher reads the created teacher through the provided transaction client", async () => {
    const transactionClient = {
      teacher: {
        create: vi.fn().mockResolvedValueOnce({ id: "teacher-1" }),
        findUnique: vi.fn().mockResolvedValueOnce({
          id: "teacher-1",
          fullName: "Jane Doe",
          title: "Mathematics Teacher",
          bio: "Cambridge mathematics specialist with a complete public profile.",
          photoUrl: null,
          teacherSubjects: [],
          cabinetUserId: null,
          displayOrder: 1,
          isActive: true,
          updatedAt: new Date("2026-05-01T10:00:00.000Z"),
        }),
      },
      teacherSubject: {
        createMany: vi.fn(),
      },
    };

    const { createTeacher } = await loadCmsRepository();
    const result = await createTeacher(
      {
        fullName: "Jane Doe",
        title: "Mathematics Teacher",
        bio: "Cambridge mathematics specialist with a complete public profile.",
        subjects: [],
        cabinetUserId: null,
        displayOrder: 1,
        isActive: true,
      },
      transactionClient,
    );

    expect(transactionClient.teacher.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullName: "Jane Doe",
        title: "Mathematics Teacher",
      }),
    });
    expect(transactionClient.teacher.findUnique).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      include: {
        teacherSubjects: {
          include: {
            subject: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
        },
      },
    });
    expect(prismaMock.teacher.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: "teacher-1" }));
  });

  it("updateTeacher updates editable teacher fields including photo replacement and removal", async () => {
    prismaMock.teacher.update.mockResolvedValueOnce({ id: "teacher-1" });
    prismaMock.teacher.update.mockResolvedValueOnce({ id: "teacher-1" });

    const { updateTeacher } = await loadCmsRepository();

    await updateTeacher("teacher-1", {
      title: "Senior Mathematics Teacher",
      photoUrl: "/uploads/jane-updated.png",
      subjects: ["subject-1"],
      cabinetUserId: null,
      displayOrder: 4,
      isActive: true,
    });

    expect(prismaMock.teacher.update).toHaveBeenNthCalledWith(1, {
      where: { id: "teacher-1" },
      data: {
        title: "Senior Mathematics Teacher",
        photoUrl: "/uploads/jane-updated.png",
        subjects: ["subject-1"],
        cabinetUserId: null,
        displayOrder: 4,
        isActive: true,
      },
    });

    await updateTeacher("teacher-1", {
      photoUrl: null,
      subjects: ["subject-2"],
      cabinetUserId: "teacher-456",
    });

    expect(prismaMock.teacher.update).toHaveBeenNthCalledWith(2, {
      where: { id: "teacher-1" },
      data: {
        photoUrl: null,
        subjects: ["subject-2"],
        cabinetUserId: "teacher-456",
      },
    });
  });

  it("setTeacherActive toggles profile visibility for public pages", async () => {
    prismaMock.teacher.update.mockResolvedValueOnce({ id: "teacher-1", isActive: false });

    const { setTeacherActive } = await loadCmsRepository();
    await setTeacherActive("teacher-1", false);

    expect(prismaMock.teacher.update).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      data: { isActive: false },
    });
  });

  it("returns serializable teacher audit snapshots without self-references", async () => {
    const transactionClient = {
      teacher: {
        findUnique: vi.fn().mockResolvedValue({ id: "teacher-1", isActive: true }),
        update: vi
          .fn()
          .mockResolvedValueOnce({ id: "teacher-1", isActive: false })
          .mockResolvedValueOnce({ id: "teacher-1", isActive: false }),
      },
      teacherSubject: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn(),
      },
    };

    const { updateTeacher, setTeacherActive } = await loadCmsRepository();
    const updateResult = (await updateTeacher(
      "teacher-1",
      { isActive: false, subjects: [] },
      transactionClient,
    )) as { after?: unknown };
    const statusResult = (await setTeacherActive("teacher-1", false, transactionClient)) as {
      after?: unknown;
    };

    expect(updateResult.after).toMatchObject({ id: "teacher-1", isActive: false });
    expect(updateResult.after).not.toBe(updateResult);
    expect(statusResult.after).toMatchObject({ id: "teacher-1", isActive: false });
    expect(statusResult.after).not.toBe(statusResult);
    expect(() => JSON.stringify({ updateResult, statusResult })).not.toThrow();
  });

  it("deleteTeacher permanently removes a teacher profile by id", async () => {
    prismaMock.teacher.delete.mockResolvedValueOnce({ id: "teacher-1" });

    const { deleteTeacher } = await loadCmsRepository();
    await deleteTeacher("teacher-1");

    expect(prismaMock.teacher.delete).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
    });
  });

  it("getPublishedTestimonials returns only published testimonials in manual order", async () => {
    prismaMock.testimonial.findMany.mockResolvedValueOnce([
      {
        id: "testimonial-1",
        studentName: "Amina",
        guardianName: "Sarah",
        quote: "Excellent support and structure.",
        levelLabel: "IGCSE",
        photoUrl: "/amina.jpg",
        isPublished: true,
        displayOrder: 1,
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
      },
      {
        id: "testimonial-2",
        studentName: "Daniel",
        guardianName: "Grace",
        quote: "Clear feedback and strong teaching.",
        levelLabel: "A Level",
        photoUrl: null,
        isPublished: true,
        displayOrder: 2,
        createdAt: new Date("2026-05-02T10:00:00.000Z"),
      },
    ]);

    const { getPublishedTestimonials } = await loadCmsRepository();
    const result = await getPublishedTestimonials();

    expect(prismaMock.testimonial.findMany).toHaveBeenCalledWith({
      where: { isPublished: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      include: { teacher: { select: { fullName: true } } },
    });
    expect(result.map((testimonial) => testimonial.id)).toEqual(["testimonial-1", "testimonial-2"]);
  });
});
