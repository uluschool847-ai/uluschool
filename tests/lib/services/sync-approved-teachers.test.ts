import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { syncApprovedTeachers } from "@/lib/services/sync-approved-teachers";

type TeacherRow = {
  id: string;
  fullName: string;
  title: string;
  bio: string;
  photoUrl: string | null;
  cabinetUserId: string | null;
  displayOrder: number;
  isActive: boolean;
};

function createFakeDatabase() {
  const teachers: TeacherRow[] = [
    {
      id: "teacher-alphonse",
      fullName: "Sir Alphonse",
      title: "Old title",
      bio: "Old biography",
      photoUrl: null,
      cabinetUserId: "cabinet-alphonse",
      displayOrder: 9,
      isActive: false,
    },
    {
      id: "teacher-extra",
      fullName: "External Teacher",
      title: "Teacher",
      bio: "A test-only teacher profile that must not remain publicly visible.",
      photoUrl: "/missing.jpg",
      cabinetUserId: "cabinet-extra",
      displayOrder: 10,
      isActive: true,
    },
  ];
  const appUsers = [
    {
      id: "admin-1",
      email: "admin@example.com",
      fullName: "Admin User",
      role: "ADMIN",
      isActive: true,
    },
    {
      id: "cabinet-alphonse",
      email: "alphonse@example.com",
      fullName: "Cabinet Alphonse",
      role: "TEACHER",
      isActive: true,
    },
    {
      id: "cabinet-extra",
      email: "extra@example.com",
      fullName: "Extra Cabinet Account",
      role: "TEACHER",
      isActive: true,
    },
  ];
  const subjects = [
    { id: "subject-mathematics", slug: "mathematics", name: "Mathematics" },
    { id: "subject-science", slug: "science", name: "Science" },
    { id: "subject-english", slug: "english-language", name: "English Language" },
    { id: "subject-biology", slug: "biology", name: "Biology" },
    { id: "subject-chemistry", slug: "chemistry", name: "Chemistry" },
  ];
  const teacherSubjects = new Map<string, Set<string>>([
    ["teacher-alphonse", new Set(["subject-mathematics"])],
    ["teacher-extra", new Set()],
  ]);
  const audits: Array<Record<string, unknown>> = [];
  let nextTeacherId = 1;
  let transactionOptions: Record<string, unknown> | undefined;

  const tx = {
    appUser: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        appUsers.find((user) => user.id === where.id) ?? null,
    },
    subject: {
      findMany: async ({ where }: { where: { slug: { in: string[] } } }) =>
        subjects.filter((subject) => where.slug.in.includes(subject.slug)),
    },
    teacher: {
      findMany: async () =>
        teachers.map((teacher) => ({
          ...teacher,
          teacherSubjects: [...(teacherSubjects.get(teacher.id) ?? [])].map((subjectId) => ({
            subjectId,
          })),
        })),
      create: async ({ data }: { data: Omit<TeacherRow, "id" | "cabinetUserId"> }) => {
        const teacher = {
          ...data,
          id: `created-${nextTeacherId++}`,
          cabinetUserId: null,
        };
        teachers.push(teacher);
        teacherSubjects.set(teacher.id, new Set());
        return teacher;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<TeacherRow> }) => {
        const teacher = teachers.find((candidate) => candidate.id === where.id);
        if (!teacher) throw new Error("Teacher not found");
        Object.assign(teacher, data);
        return { ...teacher };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = teachers.findIndex((teacher) => teacher.id === where.id);
        if (index < 0) throw new Error("Teacher not found");
        const [deleted] = teachers.splice(index, 1);
        teacherSubjects.delete(where.id);
        return deleted;
      },
    },
    teacherSubject: {
      deleteMany: async ({ where }: { where: { teacherId: string } }) => {
        teacherSubjects.set(where.teacherId, new Set());
        return { count: 1 };
      },
      createMany: async ({ data }: { data: Array<{ teacherId: string; subjectId: string }> }) => {
        for (const link of data) {
          const links = teacherSubjects.get(link.teacherId) ?? new Set<string>();
          links.add(link.subjectId);
          teacherSubjects.set(link.teacherId, links);
        }
        return { count: data.length };
      },
    },
    adminAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  };

  const database = {
    $transaction: async <T>(
      callback: (transaction: typeof tx) => Promise<T>,
      options?: Record<string, unknown>,
    ) => {
      transactionOptions = options;
      return callback(tx);
    },
  } as unknown as PrismaClient;

  return {
    appUsers,
    audits,
    database,
    teachers,
    teacherSubjects,
    getTransactionOptions: () => transactionOptions,
  };
}

describe("syncApprovedTeachers", () => {
  it("rejects a non-admin actor before changing teacher data", async () => {
    const state = createFakeDatabase();
    const before = structuredClone(state.teachers);
    const actor = state.appUsers.find((user) => user.id === "admin-1");
    if (!actor) throw new Error("Missing actor fixture");
    actor.role = "TEACHER";

    await expect(
      syncApprovedTeachers({ actorId: "admin-1", database: state.database }),
    ).rejects.toThrow("active administrator");
    expect(state.teachers).toEqual(before);
    expect(state.audits).toHaveLength(0);
  });

  it("replaces public profiles without deleting cabinet accounts and is idempotent", async () => {
    const state = createFakeDatabase();

    const first = await syncApprovedTeachers({ actorId: "admin-1", database: state.database });

    expect(first).toEqual({ created: 3, updated: 1, deleted: 1 });
    expect(state.getTransactionOptions()).toEqual(
      expect.objectContaining({ maxWait: 10_000, timeout: 30_000 }),
    );
    expect(
      state.teachers
        .sort((left, right) => left.displayOrder - right.displayOrder)
        .map(({ fullName, title, photoUrl, displayOrder, isActive }) => ({
          fullName,
          title,
          photoUrl,
          displayOrder,
          isActive,
        })),
    ).toEqual([
      {
        fullName: "Sir Nickson Onyango",
        title: "Founder and Mathematics & Science Teacher",
        photoUrl: "/nick.jpg",
        displayOrder: 1,
        isActive: true,
      },
      {
        fullName: "Sir Alphonse",
        title: "English High School Teacher",
        photoUrl: "/alphonse.jpg",
        displayOrder: 2,
        isActive: true,
      },
      {
        fullName: "Ms. Cholette",
        title: "Lower Primary Teacher",
        photoUrl: "/cholette.jpg",
        displayOrder: 3,
        isActive: true,
      },
      {
        fullName: "Sir Bernard",
        title: "Chemistry and Biology Teacher",
        photoUrl: "/bernard.png",
        displayOrder: 4,
        isActive: true,
      },
    ]);
    expect(state.appUsers.map((user) => user.id)).toEqual([
      "admin-1",
      "cabinet-alphonse",
      "cabinet-extra",
    ]);
    expect(state.audits.map((audit) => audit.action).sort()).toEqual([
      "TEACHER_PROFILE_CREATED",
      "TEACHER_PROFILE_CREATED",
      "TEACHER_PROFILE_CREATED",
      "TEACHER_PROFILE_DELETED",
      "TEACHER_PROFILE_UPDATED",
    ]);

    const second = await syncApprovedTeachers({ actorId: "admin-1", database: state.database });

    expect(second).toEqual({ created: 0, updated: 0, deleted: 0 });
    expect(state.audits).toHaveLength(5);
  });
});
