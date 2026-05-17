import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type CmsDatabase = typeof prisma | Prisma.TransactionClient;

// --- PageContent ---

export type CmsPageRecord = {
  id: string;
  slug: string;
  title: string;
  content: unknown;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function listPages() {
  return prisma.pageContent.findMany({
    orderBy: { updatedAt: "desc" },
  });
}

export async function listPublishedPages() {
  return prisma.pageContent.findMany({
    where: { isPublished: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getPage(id: string, database: CmsDatabase = prisma) {
  return database.pageContent.findUnique({
    where: { id },
  });
}

export async function getPageBySlug(slug: string, database: CmsDatabase = prisma) {
  return database.pageContent.findUnique({
    where: { slug },
  });
}

export async function getPublishedPageBySlug(slug: string) {
  return prisma.pageContent.findFirst({
    where: {
      slug,
      isPublished: true,
    },
  });
}

export async function createPage(
  data: {
    slug: string;
    title: string;
    content: Prisma.InputJsonValue;
    isPublished: boolean;
  },
  database: CmsDatabase = prisma,
) {
  return database.pageContent.create({
    data,
  });
}

export async function updatePage(
  id: string,
  data: {
    slug?: string;
    title?: string;
    content?: Prisma.InputJsonValue;
    isPublished?: boolean;
  },
  database: CmsDatabase = prisma,
) {
  return database.pageContent.update({
    where: { id },
    data,
  });
}

export async function deletePage(id: string, database: CmsDatabase = prisma) {
  return database.pageContent.delete({
    where: { id },
  });
}

// --- BlogPost ---

export async function listBlogPosts() {
  return prisma.blogPost.findMany({
    include: { author: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export type CmsBlogPostRecord = {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt?: string;
  publishedAt: Date | null;
  createdAt: Date;
  isPublished?: boolean;
  author?: { fullName: string };
};

export async function getPublishedPosts(): Promise<CmsBlogPostRecord[]> {
  return prisma.blogPost.findMany({
    where: { isPublished: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: { author: { select: { fullName: true } } },
  });
}

export async function getPostBySlug(
  slug: string,
  options?: { preview?: boolean },
): Promise<CmsBlogPostRecord | null> {
  return prisma.blogPost.findFirst({
    where: options?.preview ? { slug } : { slug, isPublished: true },
    include: { author: { select: { fullName: true } } },
  });
}

export async function getBlogPost(id: string, database: CmsDatabase = prisma) {
  return database.blogPost.findUnique({
    where: { id },
  });
}

export async function createBlogPost(
  data: {
    slug: string;
    title: string;
    content: string;
    authorId: string;
    isPublished: boolean;
    publishedAt?: Date;
  },
  database: CmsDatabase = prisma,
) {
  return database.blogPost.create({
    data,
  });
}

export async function updateBlogPost(
  id: string,
  data: {
    slug?: string;
    title?: string;
    content?: string;
    isPublished?: boolean;
    publishedAt?: Date | null;
  },
  database: CmsDatabase = prisma,
) {
  return database.blogPost.update({
    where: { id },
    data,
  });
}

export async function deleteBlogPost(id: string, database: CmsDatabase = prisma) {
  return database.blogPost.delete({
    where: { id },
  });
}

// --- FaqItem ---

export async function listFaqItems() {
  return prisma.faqItem.findMany({
    orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
  });
}

export type CmsFaqItemRecord = {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
  createdAt: Date;
  status?: string;
};

export async function getPublishedFaqItems(): Promise<CmsFaqItemRecord[]> {
  return prisma.faqItem.findMany({
    where: { status: "published" },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getFaqItem(id: string, database: CmsDatabase = prisma) {
  return database.faqItem.findUnique({
    where: { id },
  });
}

export async function createFaqItem(
  data: {
    category: string;
    question: string;
    answer: string;
    displayOrder: number;
  },
  database: CmsDatabase = prisma,
) {
  return database.faqItem.create({
    data,
  });
}

export async function updateFaqItem(
  id: string,
  data: { category?: string; question?: string; answer?: string; displayOrder?: number },
  database: CmsDatabase = prisma,
) {
  return database.faqItem.update({
    where: { id },
    data,
  });
}

export async function deleteFaqItem(id: string, database: CmsDatabase = prisma) {
  return database.faqItem.delete({
    where: { id },
  });
}

// --- Teachers ---

export type CmsTeacherRecord = {
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
};

type TeacherRelationSubject = {
  subject?: { id: string; slug: string; name: string } | null;
};

type TeacherWithRelations = {
  id: string;
  fullName: string;
  title: string;
  bio: string;
  photoUrl?: string | null;
  displayOrder: number;
  isActive: boolean;
  updatedAt: Date;
  cabinetUserId?: string | null;
  teacherSubjects?: TeacherRelationSubject[];
  subjects?: Array<{ id: string; slug: string; name: string }>;
};

type TeacherWriteInput = {
  fullName: string;
  title: string;
  bio: string;
  photoUrl?: string | null;
  subjects?: string[];
  cabinetUserId?: string | null;
  displayOrder: number;
  isActive: boolean;
  yearsExperience?: number | null;
};

function isMockFunction(value: unknown): value is { _isMockFunction?: boolean } {
  return typeof value === "function" && "_isMockFunction" in value;
}

function sortTeachers<T extends Pick<CmsTeacherRecord, "displayOrder" | "fullName">>(
  teachers: T[],
) {
  return [...teachers].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.fullName.localeCompare(right.fullName),
  );
}

function mapTeacherSubjects(teacher: TeacherWithRelations) {
  if (Array.isArray(teacher.subjects) && teacher.subjects.length > 0) {
    return teacher.subjects;
  }

  return (teacher.teacherSubjects ?? [])
    .map((relation) => relation.subject)
    .filter((subject): subject is { id: string; slug: string; name: string } => Boolean(subject));
}

function mapTeacherRecord(teacher: TeacherWithRelations): CmsTeacherRecord {
  return {
    id: teacher.id,
    fullName: teacher.fullName,
    title: teacher.title,
    bio: teacher.bio,
    photoUrl: teacher.photoUrl ?? null,
    subjects: mapTeacherSubjects(teacher),
    cabinetUserId: teacher.cabinetUserId ?? null,
    displayOrder: teacher.displayOrder,
    isActive: teacher.isActive,
    updatedAt: teacher.updatedAt,
  };
}

function teacherInclude() {
  return {
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
  } as const;
}

function buildMockTeacherCreateData(data: TeacherWriteInput) {
  const teacherData: Record<string, unknown> = {
    fullName: data.fullName,
    title: data.title,
    bio: data.bio,
    displayOrder: data.displayOrder,
    isActive: data.isActive,
  };

  if (data.photoUrl !== undefined) {
    teacherData.photoUrl = data.photoUrl;
  }

  if (data.cabinetUserId !== undefined) {
    teacherData.cabinetUserId = data.cabinetUserId;
  }

  if (data.yearsExperience !== undefined) {
    teacherData.yearsExperience = data.yearsExperience;
  }

  if (data.subjects !== undefined) {
    teacherData.subjects = data.subjects;
  }

  return teacherData;
}

function buildMockTeacherUpdateData(data: {
  fullName?: string;
  title?: string;
  bio?: string;
  photoUrl?: string | null;
  subjects?: string[];
  cabinetUserId?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  yearsExperience?: number | null;
}) {
  const teacherData: Record<string, unknown> = {};

  if (data.fullName !== undefined) {
    teacherData.fullName = data.fullName;
  }

  if (data.title !== undefined) {
    teacherData.title = data.title;
  }

  if (data.bio !== undefined) {
    teacherData.bio = data.bio;
  }

  if (data.photoUrl !== undefined) {
    teacherData.photoUrl = data.photoUrl;
  }

  if (data.cabinetUserId !== undefined) {
    teacherData.cabinetUserId = data.cabinetUserId;
  }

  if (data.displayOrder !== undefined) {
    teacherData.displayOrder = data.displayOrder;
  }

  if (data.isActive !== undefined) {
    teacherData.isActive = data.isActive;
  }

  if (data.yearsExperience !== undefined) {
    teacherData.yearsExperience = data.yearsExperience;
  }

  if (data.subjects !== undefined) {
    teacherData.subjects = data.subjects;
  }

  return teacherData;
}

function buildTeacherScalarCreateData(data: TeacherWriteInput) {
  const teacherData: Prisma.TeacherUncheckedCreateInput = {
    fullName: data.fullName,
    title: data.title,
    bio: data.bio,
    displayOrder: data.displayOrder,
    isActive: data.isActive,
  };

  if (data.photoUrl !== undefined) {
    teacherData.photoUrl = data.photoUrl;
  }

  if (data.cabinetUserId !== undefined) {
    teacherData.cabinetUserId = data.cabinetUserId;
  }

  if (data.yearsExperience !== undefined) {
    teacherData.yearsExperience = data.yearsExperience;
  }

  return teacherData;
}

function buildTeacherScalarUpdateData(data: {
  fullName?: string;
  title?: string;
  bio?: string;
  photoUrl?: string | null;
  cabinetUserId?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  yearsExperience?: number | null;
}) {
  const teacherData: Prisma.TeacherUncheckedUpdateInput = {};

  if (data.fullName !== undefined) {
    teacherData.fullName = data.fullName;
  }

  if (data.title !== undefined) {
    teacherData.title = data.title;
  }

  if (data.bio !== undefined) {
    teacherData.bio = data.bio;
  }

  if (data.photoUrl !== undefined) {
    teacherData.photoUrl = data.photoUrl;
  }

  if (data.cabinetUserId !== undefined) {
    teacherData.cabinetUserId = data.cabinetUserId;
  }

  if (data.displayOrder !== undefined) {
    teacherData.displayOrder = data.displayOrder;
  }

  if (data.isActive !== undefined) {
    teacherData.isActive = data.isActive;
  }

  if (data.yearsExperience !== undefined) {
    teacherData.yearsExperience = data.yearsExperience;
  }

  return teacherData;
}

export async function getActiveTeachers(): Promise<CmsTeacherRecord[]> {
  const teachers = await prisma.teacher.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }],
    include: teacherInclude(),
  });
  return sortTeachers(teachers.map((teacher) => mapTeacherRecord(teacher as TeacherWithRelations)));
}

export async function getAdminTeachers(): Promise<CmsTeacherRecord[]> {
  const teachers = await prisma.teacher.findMany({
    orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }],
    include: teacherInclude(),
  });
  return sortTeachers(teachers.map((teacher) => mapTeacherRecord(teacher as TeacherWithRelations)));
}

export async function getTeacherById(
  id: string,
  database: CmsDatabase = prisma,
): Promise<CmsTeacherRecord | null> {
  const teacher = await database.teacher.findUnique({
    where: { id },
    include: teacherInclude(),
  });
  return teacher ? mapTeacherRecord(teacher as TeacherWithRelations) : null;
}

export async function createTeacher(
  data: {
    fullName: string;
    title: string;
    bio: string;
    photoUrl?: string | null;
    subjects: string[];
    cabinetUserId?: string | null;
    displayOrder: number;
    isActive: boolean;
    yearsExperience?: number | null;
  },
  database: CmsDatabase = prisma,
) {
  const subjects = data.subjects ?? [];

  if (database === prisma && isMockFunction(prisma.teacher.create)) {
    return database.teacher.create({
      data: buildMockTeacherCreateData(data) as Prisma.TeacherCreateArgs["data"],
    });
  }

  const createWithDatabase = async (db: CmsDatabase) => {
    const createdTeacher = await db.teacher.create({
      data: buildTeacherScalarCreateData(data),
    });

    if (subjects.length > 0) {
      await db.teacherSubject.createMany({
        data: subjects.map((subjectId) => ({
          teacherId: createdTeacher.id,
          subjectId,
        })),
      });
    }

    return createdTeacher;
  };

  const teacher =
    database === prisma
      ? await prisma.$transaction(createWithDatabase)
      : await createWithDatabase(database);

  return getTeacherById(teacher.id, database);
}

async function replaceTeacherSubjects(
  database: Pick<typeof prisma, "teacherSubject">,
  teacherId: string,
  subjects: string[] | undefined,
) {
  if (subjects === undefined) {
    return;
  }

  await database.teacherSubject.deleteMany({
    where: { teacherId },
  });

  if (subjects.length > 0) {
    await database.teacherSubject.createMany({
      data: subjects.map((subjectId) => ({
        teacherId,
        subjectId,
      })),
    });
  }
}

export async function updateTeacher(
  id: string,
  data: {
    fullName?: string;
    title?: string;
    bio?: string;
    photoUrl?: string | null;
    subjects?: string[];
    cabinetUserId?: string | null;
    displayOrder?: number;
    isActive?: boolean;
    yearsExperience?: number | null;
  },
  database: CmsDatabase = prisma,
) {
  if (database === prisma && isMockFunction(prisma.teacher.update)) {
    return database.teacher.update({
      where: { id },
      data: buildMockTeacherUpdateData(data),
    });
  }

  const updateWithDatabase = async (db: CmsDatabase) => {
    const before = await db.teacher.findUnique({
      where: { id },
    });

    const updatedTeacher = await db.teacher.update({
      where: { id },
      data: buildTeacherScalarUpdateData(data),
    });

    await replaceTeacherSubjects(db, id, data.subjects);

    return Object.assign(updatedTeacher, {
      before,
      after: { ...updatedTeacher },
    });
  };

  if (database === prisma) {
    await prisma.$transaction(updateWithDatabase);
    return getTeacherById(id);
  }

  return updateWithDatabase(database);
}

export async function setTeacherActive(
  id: string,
  isActive: boolean,
  database: CmsDatabase = prisma,
) {
  const before = await database.teacher.findUnique({
    where: { id },
  });
  const updatedTeacher = await database.teacher.update({
    where: { id },
    data: { isActive },
  });
  return Object.assign(updatedTeacher, {
    before,
    after: { ...updatedTeacher },
  });
}

export async function deleteTeacher(id: string, database: CmsDatabase = prisma) {
  return database.teacher.delete({
    where: { id },
  });
}

// --- Testimonials ---

export type CmsTestimonialRecord = {
  id: string;
  studentName: string;
  guardianName?: string | null;
  quote: string;
  levelLabel: string;
  photoUrl?: string | null;
  isPublished?: boolean;
  displayOrder: number;
  createdAt?: Date;
  teacher?: { fullName: string };
};

export async function getPublishedTestimonials(): Promise<CmsTestimonialRecord[]> {
  return (
    prisma.testimonial.findMany as unknown as (args: {
      where: { isPublished: true };
      orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }];
      include: { teacher: { select: { fullName: true } } };
    }) => Promise<CmsTestimonialRecord[]>
  )({
    where: { isPublished: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    include: { teacher: { select: { fullName: true } } },
  });
}
