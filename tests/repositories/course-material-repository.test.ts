import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  attachment: {
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  courseMaterial: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  scheduledClass: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (database: unknown) => unknown) => callback(prismaMock)),
}));

const storageDeleteMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/storage", () => ({
  createStorageService: () => ({
    delete: storageDeleteMock,
  }),
}));

type CourseMaterialRepositoryModule = {
  createCourseMaterialForTeacher: (input: Record<string, unknown>) => Promise<unknown>;
  updateCourseMaterialForTeacher: (
    id: string,
    teacherId: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  deleteCourseMaterialForTeacher: (id: string, teacherId: string) => Promise<unknown>;
  getCourseMaterialForTeacher: (id: string, teacherId: string) => Promise<unknown>;
  listCourseMaterialsForTeacher: (
    teacherId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  listCourseMaterialsForTeacherClass: (
    teacherId: string,
    scheduledClassId: string,
  ) => Promise<unknown[]>;
  unlinkCourseMaterialAttachmentForTeacher: (
    teacherId: string,
    materialId: string,
    attachmentId: string,
  ) => Promise<unknown>;
  assertTeacherOwnsMaterialClass: (teacherId: string, scheduledClassId: string) => Promise<unknown>;
  assertTeacherOwnsMaterial: (teacherId: string, materialId: string) => Promise<unknown>;
};

function loadCourseMaterialRepository() {
  const specifier = "@/lib/repositories/course-material-repository";
  return import(/* @vite-ignore */ specifier) as Promise<CourseMaterialRepositoryModule>;
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    id: "material-1",
    title: "Algebra worksheet",
    description: "Practice set",
    fileUrl: "https://cdn.school/materials/algebra.pdf",
    scheduledClassId: "lesson-1",
    teacherId: "teacher-1",
    attachments: [],
    scheduledClass: {
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: { id: "group-1", teacherId: "teacher-1" },
    },
    ...overrides,
  };
}

const createInput = {
  title: "  Algebra worksheet  ",
  description: "Practice set",
  fileUrl: "https://cdn.school/materials/algebra.pdf",
  scheduledClassId: "lesson-1",
  teacherId: "teacher-1",
};

describe("course-material-repository teacher ownership contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports the dedicated Course Materials repository API", async () => {
    const repository = await loadCourseMaterialRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        createCourseMaterialForTeacher: expect.any(Function),
        updateCourseMaterialForTeacher: expect.any(Function),
        deleteCourseMaterialForTeacher: expect.any(Function),
        getCourseMaterialForTeacher: expect.any(Function),
        listCourseMaterialsForTeacher: expect.any(Function),
        listCourseMaterialsForTeacherClass: expect.any(Function),
        listStudentCourseMaterials: expect.any(Function),
        listParentChildCourseMaterials: expect.any(Function),
        unlinkCourseMaterialAttachmentForTeacher: expect.any(Function),
        assertTeacherOwnsMaterialClass: expect.any(Function),
        assertTeacherOwnsMaterial: expect.any(Function),
      }),
    );
  });

  it("creates material for a directly owned ScheduledClass and trims title", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: null,
    });
    prismaMock.courseMaterial.create.mockResolvedValueOnce(
      material({ title: "Algebra worksheet" }),
    );

    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await createCourseMaterialForTeacher({
      ...createInput,
      clientTeacherId: "teacher-2",
    });

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "lesson-1",
          OR: expect.arrayContaining([
            { teacherId: "teacher-1" },
            { classGroup: { teacherId: "teacher-1" } },
          ]),
        }),
      }),
    );
    expect(prismaMock.courseMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Algebra worksheet",
          scheduledClassId: "lesson-1",
          teacherId: "teacher-1",
        }),
      }),
    );
    expect(JSON.stringify(prismaMock.courseMaterial.create.mock.calls[0][0])).not.toContain(
      "teacher-2",
    );
  });

  it("creates material for a classGroup-owned ScheduledClass when direct teacherId is null", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-1",
      teacherId: null,
      classGroup: { id: "group-1", teacherId: "teacher-1" },
    });
    prismaMock.courseMaterial.create.mockResolvedValueOnce(material());

    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    const result = await createCourseMaterialForTeacher(createInput);

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "lesson-1",
          OR: expect.arrayContaining([{ classGroup: { teacherId: "teacher-1" } }]),
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "material-1" }));
  });

  it("rejects create for another teacher's scheduledClassId before mutation", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(null);

    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    await expect(
      createCourseMaterialForTeacher({ ...createInput, scheduledClassId: "foreign-lesson" }),
    ).rejects.toThrow(/unauthorized|not owned|not assigned|foreign/i);
    expect(prismaMock.courseMaterial.create).not.toHaveBeenCalled();
  });

  it("updates only teacher-owned material and verifies a changed scheduledClassId is also owned", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(material());
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-2",
      teacherId: "teacher-1",
      classGroup: null,
    });
    prismaMock.courseMaterial.update.mockResolvedValueOnce(
      material({ id: "material-1", scheduledClassId: "lesson-2" }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await updateCourseMaterialForTeacher("material-1", "teacher-1", {
      title: "Updated worksheet",
      scheduledClassId: "lesson-2",
    });

    expect(prismaMock.courseMaterial.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "material-1",
          OR: expect.arrayContaining([
            { teacherId: "teacher-1" },
            { scheduledClass: { teacherId: "teacher-1" } },
            { scheduledClass: { classGroup: { teacherId: "teacher-1" } } },
          ]),
        }),
      }),
    );
    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "lesson-2" }),
      }),
    );
    expect(prismaMock.courseMaterial.update).toHaveBeenCalled();
  });

  it("rejects update and delete for another teacher's material", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValue(null);

    const { deleteCourseMaterialForTeacher, updateCourseMaterialForTeacher } =
      await loadCourseMaterialRepository();

    await expect(
      updateCourseMaterialForTeacher("foreign-material", "teacher-1", { title: "Nope" }),
    ).rejects.toThrow(/not found|unauthorized|ownership/i);
    await expect(deleteCourseMaterialForTeacher("foreign-material", "teacher-1")).rejects.toThrow(
      /not found|unauthorized|ownership/i,
    );
    expect(prismaMock.courseMaterial.update).not.toHaveBeenCalled();
    expect(prismaMock.courseMaterial.delete).not.toHaveBeenCalled();
  });

  it("lists only teacher-scoped materials and rejects listing a foreign class", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([material()]);
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(null);

    const { listCourseMaterialsForTeacher, listCourseMaterialsForTeacherClass } =
      await loadCourseMaterialRepository();

    await listCourseMaterialsForTeacher("teacher-1", { search: "algebra" });

    expect(prismaMock.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { teacherId: "teacher-1" },
            { scheduledClass: { teacherId: "teacher-1" } },
            { scheduledClass: { classGroup: { teacherId: "teacher-1" } } },
          ]),
        }),
      }),
    );
    await expect(listCourseMaterialsForTeacherClass("teacher-1", "foreign-lesson")).rejects.toThrow(
      /unauthorized|not owned|foreign/i,
    );
  });

  it.each([
    ["missing title", { title: "" }, /title/i],
    ["missing scheduledClassId", { scheduledClassId: "" }, /scheduled class|required/i],
    ["missing fileUrl", { fileUrl: "" }, /file|url/i],
    ["javascript URL", { fileUrl: "javascript:alert(1)" }, /file|url|safe/i],
    ["data URL", { fileUrl: "data:text/html;base64,PHNjcmlwdA==" }, /file|url|safe/i],
    ["file URL", { fileUrl: "file:///etc/passwd" }, /file|url|safe/i],
    ["http URL", { fileUrl: "http://cdn.school/materials/a.pdf" }, /file|url|safe/i],
  ])("rejects invalid material input: %s", async (_caseName, overrides, message) => {
    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    await expect(createCourseMaterialForTeacher({ ...createInput, ...overrides })).rejects.toThrow(
      message,
    );
    expect(prismaMock.courseMaterial.create).not.toHaveBeenCalled();
  });

  it.each(["https://cdn.school/materials/algebra.pdf", "/uploads/teacher/algebra.pdf"])(
    "accepts safe fileUrl policy: %s",
    async (fileUrl) => {
      prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
        id: "lesson-1",
        teacherId: "teacher-1",
        classGroup: null,
      });
      prismaMock.courseMaterial.create.mockResolvedValueOnce(material({ fileUrl }));

      const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();
      await createCourseMaterialForTeacher({ ...createInput, fileUrl });

      expect(prismaMock.courseMaterial.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fileUrl }),
        }),
      );
    },
  );

  it("deletes only the owned material attachments and queues storage cleanup for attached files", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [
          { id: "attachment-1", storageKey: "uploads/material-1.pdf" },
          { id: "attachment-2", storageKey: "uploads/material-1-extra.pdf" },
        ],
      }),
    );
    prismaMock.courseMaterial.delete.mockResolvedValueOnce(material());
    storageDeleteMock.mockResolvedValue(undefined);

    const { deleteCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    const result = await deleteCourseMaterialForTeacher("material-1", "teacher-1");

    expect(prismaMock.courseMaterial.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "material-1" }),
        include: expect.objectContaining({ attachments: true }),
      }),
    );
    expect(prismaMock.courseMaterial.delete).toHaveBeenCalledWith({
      where: { id: "material-1" },
    });
    expect(storageDeleteMock).toHaveBeenCalledWith("uploads/material-1.pdf");
    expect(storageDeleteMock).toHaveBeenCalledWith("uploads/material-1-extra.pdf");
    expect(storageDeleteMock).not.toHaveBeenCalledWith("uploads/unrelated.pdf");
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        cleanup: expect.objectContaining({ deleted: 2 }),
      }),
    );
  });

  it("creates linked Attachment records when uploaded file metadata is provided", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: null,
    });
    prismaMock.courseMaterial.create.mockResolvedValueOnce(
      material({
        fileUrl: "/uploads/teacher/algebra.pdf",
        attachments: [
          {
            id: "attachment-1",
            filename: "algebra.pdf",
            storageKey: "uploads/teacher/algebra.pdf",
            mimeType: "application/pdf",
            size: 2048,
          },
        ],
      }),
    );

    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await createCourseMaterialForTeacher({
      ...createInput,
      fileUrl: "/uploads/teacher/algebra.pdf",
      attachments: [
        {
          filename: "algebra.pdf",
          storageKey: "uploads/teacher/algebra.pdf",
          mimeType: "application/pdf",
          size: 2048,
        },
      ],
    });

    expect(prismaMock.courseMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileUrl: "/uploads/teacher/algebra.pdf",
          attachments: {
            create: [
              expect.objectContaining({
                filename: "algebra.pdf",
                storageKey: "uploads/teacher/algebra.pdf",
                mimeType: "application/pdf",
                size: 2048,
              }),
            ],
          },
        }),
      }),
    );
  });

  it("updates material metadata without replacing existing attachments", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [{ id: "attachment-1", storageKey: "uploads/teacher/old.pdf" }],
      }),
    );
    prismaMock.courseMaterial.update.mockResolvedValueOnce(
      material({
        title: "Updated worksheet",
        attachments: [{ id: "attachment-1", storageKey: "uploads/teacher/old.pdf" }],
      }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await updateCourseMaterialForTeacher("material-1", "teacher-1", {
      title: "Updated worksheet",
      description: "Updated only",
    });

    expect(prismaMock.courseMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          attachments: expect.anything(),
        }),
      }),
    );
    expect(prismaMock.attachment.delete).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it("replaces a material file only after ownership passes and returns old storage keys for cleanup", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [{ id: "attachment-old", storageKey: "uploads/teacher/old.pdf" }],
      }),
    );
    prismaMock.courseMaterial.update.mockResolvedValueOnce(
      material({
        fileUrl: "/uploads/teacher/new.pdf",
        attachments: [{ id: "attachment-new", storageKey: "uploads/teacher/new.pdf" }],
      }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    const result = await updateCourseMaterialForTeacher("material-1", "teacher-1", {
      fileUrl: "/uploads/teacher/new.pdf",
      attachments: [
        {
          filename: "new.pdf",
          storageKey: "uploads/teacher/new.pdf",
          mimeType: "application/pdf",
          size: 4096,
        },
      ],
    });

    expect(prismaMock.courseMaterial.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "material-1" }),
      }),
    );
    expect(prismaMock.courseMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileUrl: "/uploads/teacher/new.pdf",
          attachments: {
            create: [
              expect.objectContaining({
                storageKey: "uploads/teacher/new.pdf",
              }),
            ],
          },
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        cleanup: expect.objectContaining({
          storageKeys: ["uploads/teacher/old.pdf"],
        }),
      }),
    );
  });

  it("keeps the old material and file intact when replacement attachment creation fails", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [{ id: "attachment-old", storageKey: "uploads/teacher/old.pdf" }],
      }),
    );
    prismaMock.courseMaterial.update.mockRejectedValueOnce(new Error("Attachment create failed"));

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    await expect(
      updateCourseMaterialForTeacher("material-1", "teacher-1", {
        fileUrl: "/uploads/teacher/new.pdf",
        attachments: [
          {
            filename: "new.pdf",
            storageKey: "uploads/teacher/new.pdf",
            mimeType: "application/pdf",
            size: 4096,
          },
        ],
      }),
    ).rejects.toThrow(/attachment|failed/i);

    expect(prismaMock.attachment.delete).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "attachment-old" } }),
    );
    expect(storageDeleteMock).not.toHaveBeenCalledWith("uploads/teacher/old.pdf");
  });

  it("unlinks a material attachment using teacher ownership and server-loaded storageKey", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [{ id: "attachment-1", storageKey: "uploads/teacher/material.pdf" }],
      }),
    );
    prismaMock.attachment.findFirst.mockResolvedValueOnce({
      id: "attachment-1",
      courseMaterialId: "material-1",
      storageKey: "uploads/teacher/material.pdf",
    });
    prismaMock.attachment.delete.mockResolvedValueOnce({
      id: "attachment-1",
      storageKey: "uploads/teacher/material.pdf",
    });

    const { unlinkCourseMaterialAttachmentForTeacher } = await loadCourseMaterialRepository();
    const result = await unlinkCourseMaterialAttachmentForTeacher(
      "teacher-1",
      "material-1",
      "attachment-1",
    );

    expect(prismaMock.courseMaterial.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "material-1",
          OR: expect.arrayContaining([{ teacherId: "teacher-1" }]),
        }),
      }),
    );
    expect(prismaMock.attachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "attachment-1",
          courseMaterialId: "material-1",
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        attachmentId: "attachment-1",
        storageKey: "uploads/teacher/material.pdf",
      }),
    );
  });

  it("rejects unlinking another teacher's attachment before loading cleanup keys", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(null);

    const { unlinkCourseMaterialAttachmentForTeacher } = await loadCourseMaterialRepository();

    await expect(
      unlinkCourseMaterialAttachmentForTeacher("teacher-1", "foreign-material", "attachment-1"),
    ).rejects.toThrow(/not found|unauthorized|ownership|owned/i);
    expect(prismaMock.attachment.delete).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });
});
