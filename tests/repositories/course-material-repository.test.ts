import { beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

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
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  scheduledClass: {
    findFirst: vi.fn(),
  },
}));

const storageDeleteMock = vi.hoisted(() => vi.fn());
const finalizePendingUploadsMock = vi.hoisted(() => vi.fn());
const queueStorageObjectForDeletionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/storage", () => ({
  createStorageService: () => ({
    delete: storageDeleteMock,
  }),
}));

vi.mock("@/lib/repositories/pending-upload-repository", () => ({
  finalizePendingUploads: finalizePendingUploadsMock,
  queueStorageObjectForDeletion: queueStorageObjectForDeletionMock,
}));

type CourseMaterialRepositoryModule = {
  createCourseMaterialForTeacher: (
    input: Record<string, unknown>,
    database?: unknown,
  ) => Promise<unknown>;
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
  listStudentCourseMaterials: (
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>;
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
  const value = {
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
  if (Array.isArray(value.attachments)) {
    value.attachments = value.attachments.map((attachment) => ({
      filename:
        typeof attachment.storageKey === "string"
          ? (attachment.storageKey.split("/").at(-1) ?? "material.bin")
          : "material.bin",
      mimeType: "application/octet-stream",
      size: 128,
      ...attachment,
    }));
  }
  return value;
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
    prismaMock.attachment.findMany.mockResolvedValue([]);
    prismaMock.courseMaterial.findUnique.mockResolvedValue(material());
    finalizePendingUploadsMock.mockResolvedValue(undefined);
    queueStorageObjectForDeletionMock.mockImplementation(async (input) => ({
      ownerId: input.ownerId,
      storageKey: input.storageKey,
    }));
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

  it("loads teacher edit attachments with the newest tie-broken primary first", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(material());

    const { getCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await getCourseMaterialForTeacher("material-1", "teacher-1");

    expect(prismaMock.courseMaterial.findFirst.mock.calls[0]?.[0]?.include?.attachments).toEqual({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
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

  it("finalizes exact pending attachment metadata through the supplied material transaction", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: null,
    });
    prismaMock.courseMaterial.create.mockResolvedValueOnce(material());
    const attachment = {
      filename: "algebra.pdf",
      storageKey,
      mimeType: "application/pdf",
      size: 128,
    };

    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await createCourseMaterialForTeacher(
      {
        ...createInput,
        fileUrl: storageUrlForKey(storageKey),
        attachments: [attachment],
      },
      prismaMock,
    );

    expect(finalizePendingUploadsMock).toHaveBeenCalledWith(
      {
        ownerId: "teacher-1",
        purpose: "course-material",
        uploads: [
          {
            storageKey,
            filename: "algebra.pdf",
            mimeType: "application/pdf",
            byteSize: 128,
          },
        ],
      },
      prismaMock,
    );
    expect(finalizePendingUploadsMock.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.courseMaterial.create.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
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

  it("rejects an owned material with a cross-teacher stored key before update mutation", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [
          {
            id: "attachment-foreign",
            storageKey:
              "private/teachers/teacher-2/materials/00000000-0000-4000-8000-000000000002-foreign.pdf",
          },
        ],
      }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    await expect(
      updateCourseMaterialForTeacher("material-1", "teacher-1", {
        title: "Must not mutate",
      }),
    ).rejects.toThrow(/owned by this teacher/i);
    expect(prismaMock.courseMaterial.update).not.toHaveBeenCalled();
    expect(prismaMock.attachment.deleteMany).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
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

  it.each(["https://cdn.school/materials/algebra.pdf"])(
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

  it("rejects a legacy upload URL as new material input", async () => {
    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    await expect(
      createCourseMaterialForTeacher({ ...createInput, fileUrl: "/uploads/teacher/algebra.pdf" }),
    ).rejects.toThrow(/file url|legacy|internal upload/i);
    expect(prismaMock.scheduledClass.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.courseMaterial.create).not.toHaveBeenCalled();
  });

  it("rejects a new internal application URL without matching attachment metadata", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    await expect(
      createCourseMaterialForTeacher({
        ...createInput,
        fileUrl: storageUrlForKey(storageKey),
      }),
    ).rejects.toThrow(/attachment|storage key|internal upload/i);
    expect(prismaMock.scheduledClass.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.courseMaterial.create).not.toHaveBeenCalled();
  });

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
    const { deleteCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    const result = await deleteCourseMaterialForTeacher("material-1", "teacher-1");

    expect(prismaMock.courseMaterial.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "material-1" }),
        include: expect.objectContaining({
          attachments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
        }),
      }),
    );
    expect(prismaMock.courseMaterial.delete).toHaveBeenCalledWith({
      where: { id: "material-1" },
    });
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        cleanup: expect.objectContaining({
          deleted: 0,
          storageKeys: ["uploads/material-1.pdf", "uploads/material-1-extra.pdf"],
        }),
      }),
    );
  });

  it("does not queue a shared storage key when deleting a material", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000003-shared.pdf";
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({ attachments: [{ id: "attachment-1", storageKey }] }),
    );
    prismaMock.courseMaterial.delete.mockResolvedValueOnce(material());
    queueStorageObjectForDeletionMock.mockResolvedValueOnce(null);
    const { deleteCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    const result = await deleteCourseMaterialForTeacher("material-1", "teacher-1");

    expect(queueStorageObjectForDeletionMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        cleanup: expect.objectContaining({ queued: false, storageKeys: [] }),
      }),
    );
  });

  it("deduplicates orphan cleanup keys after deleting a material", async () => {
    const storageKey = "uploads/legacy/duplicate.pdf";
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [
          { id: "attachment-1", storageKey },
          { id: "attachment-2", storageKey },
        ],
      }),
    );
    prismaMock.courseMaterial.delete.mockResolvedValueOnce(material());
    const { deleteCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    const result = await deleteCourseMaterialForTeacher("material-1", "teacher-1");

    expect(queueStorageObjectForDeletionMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        cleanup: expect.objectContaining({ queued: true, storageKeys: [storageKey] }),
      }),
    );
  });

  it("rejects a cross-teacher stored key before deleting the material or storage", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [
          {
            id: "attachment-foreign",
            storageKey:
              "private/teachers/teacher-2/materials/00000000-0000-4000-8000-000000000002-foreign.pdf",
          },
        ],
      }),
    );

    const { deleteCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await expect(deleteCourseMaterialForTeacher("material-1", "teacher-1")).rejects.toThrow(
      /owned by this teacher/i,
    );

    expect(prismaMock.courseMaterial.delete).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it("creates linked Attachment records when uploaded file metadata is provided", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    const fileUrl = storageUrlForKey(storageKey);
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: null,
    });
    prismaMock.courseMaterial.create.mockResolvedValueOnce(
      material({
        fileUrl,
        attachments: [
          {
            id: "attachment-1",
            filename: "algebra.pdf",
            storageKey,
            mimeType: "application/pdf",
            size: 2048,
          },
        ],
      }),
    );

    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await createCourseMaterialForTeacher({
      ...createInput,
      fileUrl,
      attachments: [
        {
          filename: "algebra.pdf",
          storageKey,
          mimeType: "application/pdf",
          size: 2048,
        },
      ],
    });

    expect(prismaMock.courseMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileUrl,
          attachments: {
            create: [
              expect.objectContaining({
                filename: "algebra.pdf",
                storageKey,
                mimeType: "application/pdf",
                size: 2048,
              }),
            ],
          },
        }),
      }),
    );
  });

  it("persists a namespaced attachment only with its exact application URL", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    const fileUrl = storageUrlForKey(storageKey);
    prismaMock.scheduledClass.findFirst.mockResolvedValue({
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: null,
    });
    prismaMock.courseMaterial.create.mockResolvedValue(material({ fileUrl }));

    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await createCourseMaterialForTeacher({
      ...createInput,
      fileUrl,
      attachments: [
        {
          filename: "algebra.pdf",
          storageKey,
          mimeType: "application/pdf",
          size: 2048,
        },
      ],
    });

    expect(prismaMock.courseMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileUrl,
          attachments: { create: [expect.objectContaining({ storageKey })] },
        }),
      }),
    );
  });

  it("returns namespaced application URLs as safe student material links", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    const fileUrl = storageUrlForKey(storageKey);
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([
      material({
        fileUrl,
        scheduledClassId: "lesson-1",
        attachments: [
          {
            id: "attachment-1",
            filename: "algebra.pdf",
            storageKey,
            mimeType: "application/pdf",
            size: 2048,
          },
        ],
        scheduledClass: {
          id: "lesson-1",
          title: "Algebra lesson",
          startAt: null,
          subject: { id: "subject-1", name: "Mathematics" },
          classGroup: { id: "group-1", name: "Group 1" },
        },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ]);

    const { listStudentCourseMaterials } = await loadCourseMaterialRepository();
    const [result] = await listStudentCourseMaterials("student-1");

    expect(result).toEqual(
      expect.objectContaining({
        fileUrl,
        safeFileUrl: fileUrl,
        attachments: [expect.objectContaining({ storageKey, href: fileUrl })],
      }),
    );
  });

  it("rejects a mismatched attachment URL before any repository mutation", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    const otherKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000002-other.pdf";

    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await expect(
      createCourseMaterialForTeacher({
        ...createInput,
        fileUrl: storageUrlForKey(otherKey),
        attachments: [
          {
            filename: "algebra.pdf",
            storageKey,
            mimeType: "application/pdf",
            size: 2048,
          },
        ],
      }),
    ).rejects.toThrow(/url.*storage key/i);

    expect(prismaMock.scheduledClass.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.courseMaterial.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate new attachment storage keys before any repository read or mutation", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    const attachment = {
      filename: "algebra.pdf",
      storageKey,
      mimeType: "application/pdf",
      size: 2048,
    };
    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    await expect(
      createCourseMaterialForTeacher({
        ...createInput,
        fileUrl: storageUrlForKey(storageKey),
        attachments: [attachment, { ...attachment, filename: "duplicate.pdf" }],
      }),
    ).rejects.toThrow(/duplicate.*storage key/i);

    expect(prismaMock.scheduledClass.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.attachment.findMany).not.toHaveBeenCalled();
    expect(prismaMock.courseMaterial.create).not.toHaveBeenCalled();
  });

  it("rejects reusing a new private storage key already attached to another record", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: null,
    });
    prismaMock.attachment.findMany.mockResolvedValueOnce([{ storageKey }]);
    const { createCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    await expect(
      createCourseMaterialForTeacher({
        ...createInput,
        fileUrl: storageUrlForKey(storageKey),
        attachments: [
          {
            filename: "algebra.pdf",
            storageKey,
            mimeType: "application/pdf",
            size: 2048,
          },
        ],
      }),
    ).rejects.toThrow(/already attached|reuse/i);

    expect(prismaMock.attachment.findMany).toHaveBeenCalledWith({
      where: { storageKey: { in: [storageKey] } },
      select: { storageKey: true },
    });
    expect(prismaMock.courseMaterial.create).not.toHaveBeenCalled();
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

  it("rejects changing to an internal application URL without a matching replacement", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000002-new.pdf";
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(material({ attachments: [] }));

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await expect(
      updateCourseMaterialForTeacher("material-1", "teacher-1", {
        fileUrl: storageUrlForKey(storageKey),
      }),
    ).rejects.toThrow(/attachment|storage key|internal upload/i);

    expect(prismaMock.courseMaterial.update).not.toHaveBeenCalled();
    expect(prismaMock.attachment.deleteMany).not.toHaveBeenCalled();
  });

  it("accepts canonical A only when it binds to persisted primary attachment A", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    const fileUrl = storageUrlForKey(storageKey);
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        fileUrl,
        attachments: [{ id: "attachment-1", storageKey }],
      }),
    );
    prismaMock.courseMaterial.update.mockResolvedValueOnce(
      material({
        title: "Updated worksheet",
        fileUrl,
        attachments: [{ id: "attachment-1", storageKey }],
      }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await updateCourseMaterialForTeacher("material-1", "teacher-1", {
      title: "Updated worksheet",
      fileUrl,
    });

    expect(prismaMock.courseMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fileUrl }),
      }),
    );
    expect(prismaMock.attachment.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects duplicated canonical B when persisted primary attachment A is trusted", async () => {
    const primaryStorageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-primary.pdf";
    const duplicatedStorageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000002-duplicate.pdf";
    const duplicatedFileUrl = storageUrlForKey(duplicatedStorageKey);
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        fileUrl: duplicatedFileUrl,
        attachments: [{ id: "attachment-a", storageKey: primaryStorageKey }],
      }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await expect(
      updateCourseMaterialForTeacher("material-1", "teacher-1", {
        title: "Rejected duplicate token",
        fileUrl: duplicatedFileUrl,
      }),
    ).rejects.toThrow(/attachment|storage key|internal upload/i);

    expect(prismaMock.courseMaterial.update).not.toHaveBeenCalled();
    expect(prismaMock.attachment.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects duplicated canonical B when no persisted attachment exists", async () => {
    const duplicatedStorageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000002-duplicate.pdf";
    const duplicatedFileUrl = storageUrlForKey(duplicatedStorageKey);
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({ fileUrl: duplicatedFileUrl, attachments: [] }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await expect(
      updateCourseMaterialForTeacher("material-1", "teacher-1", {
        title: "Rejected attachment-less token",
        fileUrl: duplicatedFileUrl,
      }),
    ).rejects.toThrow(/attachment|storage key|internal upload/i);

    expect(prismaMock.courseMaterial.update).not.toHaveBeenCalled();
    expect(prismaMock.attachment.deleteMany).not.toHaveBeenCalled();
  });

  it("accepts the trusted primary attachment URL and normalizes a stale duplicated URL during metadata and lesson edits", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    const canonicalFileUrl = storageUrlForKey(storageKey);
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        fileUrl: "https://cdn.example.com/stale-algebra.pdf",
        attachments: [{ id: "attachment-1", storageKey }],
      }),
    );
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-2",
      teacherId: "teacher-1",
      classGroup: null,
    });
    prismaMock.courseMaterial.update.mockResolvedValueOnce(
      material({
        title: "Updated algebra worksheet",
        description: "Updated description",
        fileUrl: canonicalFileUrl,
        scheduledClassId: "lesson-2",
        attachments: [{ id: "attachment-1", storageKey }],
      }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await updateCourseMaterialForTeacher("material-1", "teacher-1", {
      title: "Updated algebra worksheet",
      description: "Updated description",
      fileUrl: canonicalFileUrl,
      scheduledClassId: "lesson-2",
    });

    expect(prismaMock.courseMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "material-1" },
        data: expect.objectContaining({
          title: "Updated algebra worksheet",
          description: "Updated description",
          fileUrl: canonicalFileUrl,
          scheduledClass: { connect: { id: "lesson-2" } },
        }),
      }),
    );
    expect(prismaMock.attachment.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a canonical URL that does not match the trusted persisted primary attachment", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-algebra.pdf";
    const mismatchedStorageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000002-other.pdf";
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        fileUrl: "https://cdn.example.com/stale-algebra.pdf",
        attachments: [{ id: "attachment-1", storageKey }],
      }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    await expect(
      updateCourseMaterialForTeacher("material-1", "teacher-1", {
        title: "Rejected edit",
        fileUrl: storageUrlForKey(mismatchedStorageKey),
      }),
    ).rejects.toThrow(/attachment|storage key|internal upload/i);

    expect(prismaMock.courseMaterial.update).not.toHaveBeenCalled();
  });

  it("replaces a material file only after ownership passes and returns old storage keys for cleanup", async () => {
    const newStorageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000002-new.pdf";
    const newFileUrl = storageUrlForKey(newStorageKey);
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [
          {
            id: "attachment-old",
            storageKey: "uploads/teacher/old.pdf",
            filename: "old.pdf",
            mimeType: "application/pdf",
            size: 1024,
          },
        ],
      }),
    );
    prismaMock.courseMaterial.update.mockResolvedValueOnce(
      material({
        fileUrl: newFileUrl,
        attachments: [{ id: "attachment-new", storageKey: newStorageKey }],
      }),
    );

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();
    const result = await updateCourseMaterialForTeacher("material-1", "teacher-1", {
      fileUrl: newFileUrl,
      attachments: [
        {
          filename: "new.pdf",
          storageKey: newStorageKey,
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
          fileUrl: newFileUrl,
          attachments: {
            create: [
              expect.objectContaining({
                storageKey: newStorageKey,
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
    expect(queueStorageObjectForDeletionMock).toHaveBeenCalledWith(
      {
        ownerId: "teacher-1",
        purpose: "course-material",
        storageKey: "uploads/teacher/old.pdf",
        filename: "old.pdf",
        mimeType: "application/pdf",
        byteSize: 1024,
      },
      prismaMock,
    );
  });

  it("does not queue or delete a same-key replacement and returns the final attachment state", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000002-same.pdf";
    const oldAttachment = { id: "attachment-old", storageKey };
    const newAttachment = { id: "attachment-new", storageKey };
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({ fileUrl: storageUrlForKey(storageKey), attachments: [oldAttachment] }),
    );
    prismaMock.attachment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ storageKey }]);
    prismaMock.courseMaterial.update.mockResolvedValueOnce(
      material({ attachments: [oldAttachment, newAttachment] }),
    );
    prismaMock.courseMaterial.findUnique.mockResolvedValueOnce(
      material({ attachments: [newAttachment] }),
    );
    queueStorageObjectForDeletionMock.mockResolvedValueOnce(null);
    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    const result = await updateCourseMaterialForTeacher("material-1", "teacher-1", {
      fileUrl: storageUrlForKey(storageKey),
      attachments: [
        {
          filename: "same.pdf",
          storageKey,
          mimeType: "application/pdf",
          size: 4096,
        },
      ],
    });

    expect(prismaMock.courseMaterial.findUnique).toHaveBeenCalledWith({
      where: { id: "material-1" },
      include: expect.objectContaining({
        attachments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        attachments: [expect.objectContaining(newAttachment)],
        cleanup: expect.objectContaining({ queued: false, storageKeys: [] }),
      }),
    );
  });

  it("keeps the old material and file intact when replacement attachment creation fails", async () => {
    const newStorageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000002-new.pdf";
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({
        attachments: [{ id: "attachment-old", storageKey: "uploads/teacher/old.pdf" }],
      }),
    );
    prismaMock.courseMaterial.update.mockRejectedValueOnce(new Error("Attachment create failed"));

    const { updateCourseMaterialForTeacher } = await loadCourseMaterialRepository();

    await expect(
      updateCourseMaterialForTeacher("material-1", "teacher-1", {
        fileUrl: storageUrlForKey(newStorageKey),
        attachments: [
          {
            filename: "new.pdf",
            storageKey: newStorageKey,
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

  it("does not queue a shared storage key when unlinking an attachment", async () => {
    const storageKey =
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000003-shared.pdf";
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({ attachments: [{ id: "attachment-1", storageKey }] }),
    );
    prismaMock.attachment.findFirst.mockResolvedValueOnce({
      id: "attachment-1",
      courseMaterialId: "material-1",
      storageKey,
    });
    prismaMock.attachment.delete.mockResolvedValueOnce({ id: "attachment-1", storageKey });
    prismaMock.courseMaterial.findUnique.mockResolvedValueOnce(material({ attachments: [] }));
    queueStorageObjectForDeletionMock.mockResolvedValueOnce(null);
    const { unlinkCourseMaterialAttachmentForTeacher } = await loadCourseMaterialRepository();

    const result = await unlinkCourseMaterialAttachmentForTeacher(
      "teacher-1",
      "material-1",
      "attachment-1",
    );

    expect(result).toEqual(
      expect.objectContaining({
        attachments: [],
        cleanup: expect.objectContaining({ queued: false, storageKeys: [] }),
      }),
    );
  });

  it("queues one unique orphan after unlinking its final attachment reference", async () => {
    const storageKey = "uploads/teacher/material.pdf";
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(
      material({ attachments: [{ id: "attachment-1", storageKey }] }),
    );
    prismaMock.attachment.findFirst.mockResolvedValueOnce({
      id: "attachment-1",
      courseMaterialId: "material-1",
      storageKey,
    });
    prismaMock.attachment.delete.mockResolvedValueOnce({ id: "attachment-1", storageKey });
    prismaMock.courseMaterial.findUnique.mockResolvedValueOnce(material({ attachments: [] }));
    const { unlinkCourseMaterialAttachmentForTeacher } = await loadCourseMaterialRepository();

    const result = await unlinkCourseMaterialAttachmentForTeacher(
      "teacher-1",
      "material-1",
      "attachment-1",
    );

    expect(queueStorageObjectForDeletionMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        cleanup: expect.objectContaining({ queued: true, storageKeys: [storageKey] }),
      }),
    );
  });

  it("rejects a cross-teacher stored key before unlinking the attachment", async () => {
    prismaMock.courseMaterial.findFirst.mockResolvedValueOnce(material());
    prismaMock.attachment.findFirst.mockResolvedValueOnce({
      id: "attachment-1",
      courseMaterialId: "material-1",
      storageKey:
        "private/teachers/teacher-2/materials/00000000-0000-4000-8000-000000000002-foreign.pdf",
    });

    const { unlinkCourseMaterialAttachmentForTeacher } = await loadCourseMaterialRepository();
    await expect(
      unlinkCourseMaterialAttachmentForTeacher("teacher-1", "material-1", "attachment-1"),
    ).rejects.toThrow(/owned by this teacher/i);

    expect(prismaMock.attachment.delete).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
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
